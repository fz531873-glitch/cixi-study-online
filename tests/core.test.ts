import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {dispatch,catalog,today} from '../lib/study.ts';
import originalCatalog from '../data/catalog.json' with {type:'json'};
import simulationCatalog from '../data/simulations.json' with {type:'json'};

// 用真实SQLite执行同一份SQL，模拟D1的参数绑定和原子批处理。
function database(upgrade = true) {
  const sqlite=new DatabaseSync(':memory:');
  const migrations = readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();
  const migrate = (files: string[]) => {
    for (const file of files) sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  };
  migrate(upgrade ? migrations : migrations.slice(0,1));
  const db:any={prepare(sql:string){let params:any[]=[];return {bind(...v:any[]){params=v;return this},async first(){return sqlite.prepare(sql).get(...params)||null},async all(){return {results:sqlite.prepare(sql).all(...params)}},async run(){const r=sqlite.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}}}}},async batch(statements:any[]){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}};
  return {db,sqlite,upgrade:()=>migrate(migrations.slice(1)),call:(method:string,path:string,value?:any,user='owner')=>dispatch(db,user,method,path,value)};
}
const progress={tab:'真题练习',knowledgeId:20002,questionId:19031,answer:['A','C'],confidence:'犹豫',mode:'全部',queue:[],exam:'2019年7月象山事业单位',submittedId:null,knowledgeScope:'category'};
const submission=(questionId:number,answer:string,confidence='确定')=>({questionId,answer,confidence,requestId:crypto.randomUUID()});

test('535题都有判断依据；原345题及2019年题型和来源不变',()=>{
  assert.equal(catalog.questions.length,535);
  assert.deepEqual(catalog.questions.filter(q=>q.id<500000),originalCatalog.questions);
  for(const q of catalog.questions){assert.ok(q.direct.length>=12);assert.ok(q.analysis);assert.ok(q.source_page>0&&q.analysis_page>0)}
  const qs=catalog.questions.filter(q=>q.exam.startsWith('2019'));
  assert.deepEqual(qs.reduce((n:any,q)=>({...n,[q.type]:(n[q.type]||0)+1}),{}),{'单选':30,'多选':5,'判断':20});
  assert.ok(qs.some(q=>q.source_page>1));assert.ok(qs[54].body.length<100);
});
test('未登录拒绝；列表不会泄露答案、直解或争议说明',async()=>{
  const {call}=database();await assert.rejects(call('GET','/bootstrap',undefined,''),/登录/);
  const b=await call('GET','/bootstrap');assert.equal(b.questions.length,535);
  for(const q of b.questions)for(const field of ['answer','analysis','direct','note'])assert.ok(!(field in q));
});
test('单选、多选、判断正确判定，非法组合和重复答案被拒绝',async()=>{
  const {call}=database();for(const a of [submission(13,'D'),submission(19031,'DCA'),submission(19037,'D')])assert.equal((await call('POST','/attempt',a)).correct,true);
  for(const a of [submission(13,'AB'),submission(19037,'B'),submission(13,'AA'),submission(13,'E')])await assert.rejects(call('POST','/attempt',a));
});
test('全部535题能判分；超过600项复习的完整备份可恢复',async()=>{
  const {call}=database();for(const q of catalog.questions)assert.equal((await call('POST','/attempt',submission(q.id,q.answer))).correct,true,`${q.id}`);
  for(const k of catalog.knowledge)await call('POST','/recall',{knowledgeId:k.id,rating:'记住了'});
  const backup=await call('GET','/backup');assert.ok(backup.records.review.length>600);
  assert.ok(new TextEncoder().encode(JSON.stringify(backup)).length<8_000_000);
  await call('POST','/restore',backup);
  assert.deepEqual((await call('GET','/backup')).records,backup.records);
});
test('同一提交重复请求只记录一次，冲突的提交编号拒绝',async()=>{
  const {call}=database(),a=submission(13,'D');await call('POST','/attempt',a);await call('POST','/attempt',a);
  assert.equal((await call('GET','/bootstrap')).attempts.length,1);
  await assert.rejects(call('POST','/attempt',{...a,answer:'A'}),/编号/);
});
test('猜对次日复习，同日答对不会推迟复习，首次和重复仍分别保存',async()=>{
  const {call}=database();
  await call('POST','/attempt',submission(13,'D','猜的'));
  const before=await call('GET','/backup');
  const [review]=before.records.review;
  const card=JSON.parse(review.memory);
  assert.equal(card.model,'fsrs-6');
  assert.equal(card.scheduled_days,1);
  assert.equal(before.records.attempt[0].kind,'首次');
  await call('POST','/attempt',submission(13,'D'));
  const after=await call('GET','/backup');
  assert.deepEqual(after.records.review,[review]);
  assert.ok(after.records.attempt.some((a:any)=>a.kind==='重复'));
});
test('争议题保留资料答案，隔离掌握与复习',async()=>{
  const {call}=database();const r=await call('POST','/attempt',submission(16,'C'));assert.equal(r.disputed,true);assert.ok(r.direct.includes('缺少'));
  const b=await call('GET','/bootstrap');assert.equal(b.attempts[0].disputed,1);assert.equal(b.reviews.length,0);
});
test('回忆、草稿和错因跨载入保存，其他账号看不到',async()=>{
  const {call}=database();await call('POST','/progress',progress);await call('POST','/recall',{knowledgeId:20002,rating:'记住一部分'});
  const r=await call('POST','/attempt',submission(13,'A'));await call('POST','/reason',{id:r.id,reason:'概念混淆'});
  let b=await call('GET','/bootstrap');assert.deepEqual(b.progress,progress);assert.equal(b.attempts[0].error_reason,'概念混淆');assert.equal(b.reviews.length,2);
  b=await call('GET','/bootstrap',undefined,'other');assert.equal(b.attempts.length,0);assert.equal(b.progress,null);
  await assert.rejects(call('POST','/reason',{id:r.id,reason:'其他'},'other'));
});
test('纠错保存版本，旧作答快照保留，过期版本冲突不覆盖',async()=>{
  const {call,sqlite}=database();await call('POST','/attempt',submission(13,'D'));const q=await call('GET','/editor/question/13');
  await call('POST','/edit',{kind:'question',itemId:13,version:q.version,payload:{...q,answer:'A',direct:'测试修订参考答案并验证旧作答依据仍然保留。'},reason:'测试版本保存'});
  assert.equal((await call('GET','/editor/question/13')).answer,'A');
  assert.equal(JSON.parse((sqlite.prepare('SELECT snapshot FROM attempt').get() as any).snapshot).answer,'D');
  await assert.rejects(call('POST','/edit',{kind:'question',itemId:13,version:1,payload:q,reason:'过期修订'}),/更新/);
  assert.equal((await call('GET','/history')).length,1);
});
test('知识正文可修订，手工确认或排除关联后统一生效',async()=>{
  const {call}=database(),b=await call('GET','/bootstrap'),k=b.knowledge.find((k:any)=>k.id===20002);
  await call('POST','/edit',{kind:'knowledge',itemId:k.id,version:1,payload:{...k,content:k.content+'注意区分提案权。'},reason:'补充易混提醒'});
  await call('POST','/link',{knowledgeId:20002,questionId:24012,status:'已排除',reason:'核对排除测试'});
  const after=await call('GET','/bootstrap');assert.ok(after.knowledge.find((k:any)=>k.id===20002).content.includes('注意区分'));
  assert.equal(after.links.find((l:any)=>l.knowledge_id===20002&&l.question_id===24012).status,'已排除');
});
test('备份恢复覆盖完整用户记录，保留其他账号并具有原子性',async()=>{
  const {call}=database();await call('POST','/attempt',submission(13,'D'));await call('POST','/progress',progress);
  await call('POST','/recall',{knowledgeId:20002,rating:'记住了'});const before=await call('GET','/backup');
  await call('POST','/attempt',submission(19031,'ACD'));await call('POST','/attempt',submission(13,'A'), 'other');
  await call('POST','/restore',before);const after=await call('GET','/backup');assert.deepEqual(after.records,before.records);
  assert.equal((await call('GET','/bootstrap',undefined,'other')).attempts.length,1);
  const bad=structuredClone(before);bad.records.attempt.push({...bad.records.attempt[0]});await assert.rejects(call('POST','/restore',bad));
  assert.deepEqual((await call('GET','/backup')).records,before.records);
});
test('无效备份和草稿在写入前被拒绝',async()=>{
  const {call}=database();await call('POST','/attempt',submission(13,'D'));const backup=await call('GET','/backup');
  const bad=structuredClone(backup);bad.records.attempt[0].snapshot='not json';await assert.rejects(call('POST','/restore',bad));
  await assert.rejects(call('POST','/progress',{...progress,questionId:999999}));
  assert.equal((await call('GET','/bootstrap')).attempts.length,1);
});
test('已提交解析能恢复，其他账号不能读取作答快照',async()=>{
  const {call}=database(),result=await call('POST','/attempt',submission(19031,'ACD','犹豫'));
  await call('POST','/progress',{...progress,answer:['A','C','D'],submittedId:result.id});
  assert.equal((await call('GET','/bootstrap')).progress.submittedId,result.id);
  assert.equal((await call('GET','/attempt/'+result.id)).direct,result.direct);
  await assert.rejects(call('GET','/attempt/'+result.id,undefined,'other'));
});
test('北京时间跨日计算正确',()=>{
  assert.equal(today(new Date('2026-11-03T16:01:00Z')),'2026-11-04');assert.equal(today(new Date('2026-11-03T15:59:00Z')),'2026-11-03');
});
test('整类学习和指定知识点的范围随学习位置保存，旧草稿兼容',async()=>{
  const {call}=database();
  await call('POST','/progress',{...progress,tab:'知识学习',knowledgeId:10135,knowledgeScope:'category'});
  assert.equal((await call('GET','/bootstrap')).progress.knowledgeScope,'category');
  await call('POST','/progress',{...progress,tab:'知识学习',knowledgeId:10140,knowledgeScope:'point'});
  assert.equal((await call('GET','/bootstrap')).progress.knowledgeScope,'point');
  const {knowledgeScope,...legacy}=progress;await call('POST','/progress',legacy);
  assert.equal((await call('GET','/bootstrap')).progress.knowledgeScope,'category');
});

test('190道模拟题按既有15大类关联，补充38张知识卡，标注参考来源',()=>{
  const mocks=simulationCatalog.questions;
  assert.deepEqual(catalog.questions.filter(q=>'kind' in q&&q.kind==='模拟题'),mocks);
  assert.equal(mocks.length,190);assert.equal(catalog.knowledge.length,234);
  assert.equal(new Set(catalog.questions.map(q=>q.id)).size,535);
  assert.deepEqual(new Set(catalog.knowledge.map(k=>k.category)),new Set(originalCatalog.knowledge.map(k=>k.category)));
  const originalIds=new Set(originalCatalog.questions.filter(q=>q.type==='单选').map(q=>q.id));
  assert.deepEqual(new Set(mocks.map(q=>q.template_question_id)),originalIds);
  for(const q of mocks){
    const links=catalog.links.filter(l=>l.question_id===q.id&&l.status==='已确认');
    assert.equal(links.length,1);assert.ok(q.exam.startsWith('模拟题 · '));
    assert.equal(catalog.knowledge.find(k=>k.id===links[0].knowledge_id)?.category,q.category);
    assert.ok(q.note.includes('非历年真题'));assert.equal(q.status,'待核对');
  }
});

test('完整535题混合队列和补充知识回忆可保存',async()=>{
  const {call}=database(),queue=catalog.questions.map(q=>q.id);
  const p={...progress,questionId:500001,knowledgeId:30001,mode:'混合',exam:'',queue};
  await call('POST','/progress',p);await call('POST','/recall',{knowledgeId:30001,rating:'记住一部分'});
  const b=await call('GET','/bootstrap');assert.deepEqual(b.progress,p);
  assert.ok(b.reviews.some((r:any)=>r.kind==='knowledge'&&r.item_id===30001));
});

test('旧345题196知识备份仍可恢复，损坏或混搭目录被拒绝',async()=>{
  const {call}=database();await call('POST','/attempt',submission(13,'D'));
  const old=await call('GET','/backup');old.catalog=originalCatalog;
  delete old.records.review[0].memory;
  old.records.review[0].due_date='2026-12-03';
  old.records.review[0].stage=2;
  await call('POST','/attempt',submission(500001,catalog.questions.find(q=>q.id===500001)!.answer));
  await call('POST','/restore',old);assert.equal((await call('GET','/bootstrap')).attempts.length,1);
  assert.equal((await call('GET','/bootstrap')).questions.length,535);
  const [restored] = (await call('GET','/backup')).records.review;
  assert.deepEqual({...restored},{...old.records.review[0],memory:null});
  const bad=structuredClone(old);bad.catalog.questions[0].id=500001;
  await assert.rejects(call('POST','/restore',bad),/不匹配/);
  assert.equal((await call('GET','/bootstrap')).attempts.length,1);
});

test('混合复习批次随进度保存和恢复，并拒绝无效项目及索引',async()=>{
  const {call}=database();
  const reviewBatch={
    items:[{kind:'question',item_id:13},{kind:'knowledge',item_id:20002}],
    index:1,recalled:true,
  };
  const current={...progress,tab:'知识学习',reviewBatch};
  await call('POST','/progress',current);
  const backup=await call('GET','/backup');
  await call('POST','/progress',progress);
  await call('POST','/restore',backup);
  assert.deepEqual((await call('GET','/bootstrap')).progress,current);
  await assert.rejects(call('POST','/progress',{...current,reviewBatch:{...reviewBatch,index:3}}));
  await assert.rejects(call('POST','/progress',{...current,reviewBatch:{...reviewBatch,items:[
    reviewBatch.items[0],{kind:'knowledge',item_id:13},
  ]}}));
  assert.deepEqual((await call('GET','/bootstrap')).progress,current);
});

test('旧数据库迁移保留到期日，知识点首次回忆后才建立记忆状态',async()=>{
  const {call,sqlite,upgrade}=database(false);
  sqlite.exec("INSERT INTO review(user_id,kind,item_id,due_date,stage) VALUES ('owner','knowledge',20002,'2026-12-03',2)");
  upgrade();
  const [old] = (await call('GET','/bootstrap')).reviews;
  assert.deepEqual({...old},{kind:'knowledge',item_id:20002,due_date:'2026-12-03',stage:2});
  await call('POST','/recall',{knowledgeId:20002,rating:'记住一部分'});
  const backup=await call('GET','/backup');
  assert.equal(JSON.parse(backup.records.review[0].memory).scheduled_days,2);
  const bad=structuredClone(backup);
  bad.records.review[0].memory=JSON.stringify({model:'fsrs-6',stability:-1});
  await assert.rejects(call('POST','/restore',bad));
  assert.deepEqual((await call('GET','/backup')).records,backup.records);
});

test('并发更新使记忆状态过期时，回滚这次作答并保留更新后的安排',async()=>{
  const {call,db,sqlite}=database();
  await call('POST','/attempt',submission(13,'D'));
  const batch=db.batch.bind(db);
  db.batch=(statements: D1PreparedStatement[])=>{
    sqlite.exec("UPDATE review SET memory=NULL,due_date='2026-12-03' WHERE item_id=13");
    return batch(statements);
  };
  await assert.rejects(call('POST','/attempt',submission(13,'A')),/NOT NULL constraint failed: review.due_date/);
  const after=await call('GET','/backup');
  assert.equal(after.records.attempt.length,1);
  assert.equal(after.records.review[0].due_date,'2026-12-03');
  assert.equal(after.records.review[0].memory,null);
});
