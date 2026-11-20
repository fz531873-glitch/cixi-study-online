import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {dispatch,catalog,today} from '../lib/study.ts';
import {loadBreakdownMap} from '../lib/breakdown-data.ts';
import {buildAnswerFeedback} from '../lib/breakdown.ts';
import originalCatalog from '../data/catalog.json' with {type:'json'};
import simulationCatalog from '../data/simulations.json' with {type:'json'};
import breakdownsData from '../data/question-breakdowns.json' with {type:'json'};

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

test('下午卷计数题按数量讲解，无配对卡的题仍返回逐项依据',async()=>{
  const {call}=database();
  const boot=await call('GET','/bootstrap');
  assert.ok(!boot.links.some((link:any)=>link.question_id===25107));
  const count=await call('POST','/attempt',submission(25105,'B'));
  assert.equal(count.correct,false);
  const feedback=buildAnswerFeedback(count.breakdown,'B',count.answer);
  assert.match(feedback.headline,/你选了 2 项，正确数量为 4 项/);
  assert.deepEqual(feedback.sections.flatMap(section=>section.items.map(item=>item.key)),['①','②','③','④']);
  const noCard=await call('POST','/attempt',submission(25107,'A'));
  assert.equal(noCard.correct,true);
  assert.ok(noCard.breakdown.items.every((item:any)=>item.basis&&item.knowledge_gap&&item.knowledge_id===null));
  await call('POST','/restore',await call('GET','/backup'));
  assert.deepEqual((await call('GET','/attempt/'+count.id)).breakdown.count_options,{A:1,B:2,C:3,D:4});
});

test('535题都有判断依据；原345题及2019年题型和来源不变',()=>{
  assert.equal(catalog.questions.length,535);
  assert.deepEqual(catalog.questions.filter(q=>q.id<500000),originalCatalog.questions);
  for(const q of catalog.questions){assert.ok(q.direct.length>=12);assert.ok(q.analysis);assert.ok(q.source_page>0&&q.analysis_page>0)}
  const qs=catalog.questions.filter(q=>q.exam.startsWith('2019'));
  assert.deepEqual(qs.reduce((n:any,q)=>({...n,[q.type]:(n[q.type]||0)+1}),{}),{'单选':30,'多选':5,'判断':20});
  assert.ok(qs.some(q=>q.source_page>1));assert.ok(qs[54].body.length<100);
});

test('下午卷整卷可查看逐项依据，零项计数与争议作答使用正确的反馈',async()=>{
  const {call}=database();
  const questions=catalog.questions.filter(q=>q.exam==='2025年下午卷');
  assert.equal(questions.length,45);
  const results=[];
  for(const q of questions){
    const result=await call('POST','/attempt',submission(q.id,q.id===25123?'A':q.answer));
    assert.equal(result.breakdown?.question_id,q.id);
    results.push(result);
  }
  assert.deepEqual(results.filter(r=>r.disputed).map(r=>r.questionId).sort(),[25129,25136,25145]);
  assert.equal(results.reduce((total,r)=>total+r.breakdown.items.length,0),134);
  const count=results.find(r=>r.questionId===25123);
  const feedback=buildAnswerFeedback(count.breakdown,'A',count.answer);
  assert.match(feedback.headline,/你选了 0 项，正确数量为 1 项/);
  assert.deepEqual(feedback.sections[0].items.map(item=>item.key),['②']);
  const injury=results.find(r=>r.questionId===25129);
  assert.equal(injury.answer,'AD');
  const injuryFeedback=buildAnswerFeedback(injury.breakdown,'AD',injury.answer);
  assert.equal(injuryFeedback.sections[0].items[0].key,'C');
  assert.match(injuryFeedback.sections[0].items[0].basis,/48小时/);
  const boot=await call('GET','/bootstrap');
  assert.ok(boot.reviews.some((r:{item_id:number})=>r.item_id===25123));
  assert.ok(boot.reviews.every((r:{item_id:number})=>![25129,25136,25145].includes(r.item_id)));
});

test('未登录拒绝；列表不会泄露答案、直解或争议说明',async()=>{
  const {call}=database();await assert.rejects(call('GET','/bootstrap',undefined,''),/登录/);
  const b=await call('GET','/bootstrap');assert.equal(b.questions.length,535);
  for(const q of b.questions)for(const field of ['answer','analysis','direct','note','breakdown'])assert.ok(!(field in q));
});
test('刷题接口仅返回已确认的卡片ID；候选和出处只在关联复核接口提供',async()=>{
  const {call}=database();
  const boot=await call('GET','/bootstrap');
  assert.ok(boot.links.length>0);
  assert.ok(boot.links.every((link:any)=>link.status==='已确认'));
  assert.ok(boot.links.every((link:any)=>!('reason'in link)&&!('rule_id'in link)&&!('source_ref'in link)));
  const audit=await call('GET','/link-audit');
  assert.ok(audit.some((link:any)=>link.question_id===15&&link.status==='候选'&&link.source_ref));
  assert.ok(audit.some((link:any)=>link.question_id===18&&link.knowledge_id===10183&&link.status==='已确认'));
});
test('逐项解析随当时的作答保存，旧快照和用户修订使用各自的原解析',async()=>{
  const {call,sqlite}=database();
  const result=await call('POST','/attempt',submission(13,'B'));
  assert.equal(result.breakdown.question_id,13);
  assert.deepEqual((await call('GET','/attempt/'+result.id)).breakdown,result.breakdown);
  const editor=await call('GET','/editor/question/13');
  assert.deepEqual(editor.breakdown,result.breakdown);
  await call('POST','/edit',{kind:'question',itemId:13,version:editor.version,payload:{...editor,answer:'A'},reason:'测试修改依据'});
  assert.equal((await call('GET','/editor/question/13')).breakdown,null);
  assert.equal((await call('POST','/attempt',submission(13,'A'))).breakdown,undefined);
  const {breakdown,...previous}=JSON.parse((sqlite.prepare('SELECT snapshot FROM attempt WHERE id=?').get(result.id) as {snapshot:string}).snapshot);
  sqlite.prepare('UPDATE attempt SET snapshot=? WHERE id=?').run(JSON.stringify(previous),result.id);
  assert.equal((await call('GET','/attempt/'+result.id)).breakdown,undefined);
  assert.equal((await call('GET','/editor/question/23003')).breakdown,null);
});
test('待核对题目即使具有完整草稿，作答也只返回原解析',async()=>{
  const {db,call}=database();
  const result=await call('POST','/attempt',submission(25,'C'));
  assert.equal(result.breakdown,undefined);
  assert.ok(result.analysis);

  // 构造具有完整有效 rule_id（全部非 RULE-UNVERIFIED）但 status 为「待核对」的隔离夹具
  const q13Seed=structuredClone(breakdownsData.breakdowns.find(b=>b.question_id===13)!);
  assert.ok(q13Seed.items.every(it=>it.rule_id&&it.rule_id!=='RULE-UNVERIFIED'));
  const pendingValidDraft={
    ...q13Seed,
    question_id:25,
    status:'待核对' as const,
  };
  const customLookup=loadBreakdownMap([pendingValidDraft]);
  assert.equal(customLookup.size,0);
  const isolatedAttempt=await dispatch(db,'owner','POST','/attempt',submission(25,'C'),{breakdownLookup:customLookup});
  assert.equal(isolatedAttempt.breakdown,undefined);
  assert.ok(isolatedAttempt.analysis);

  // 对照：若同一套完整规则草稿状态变为「已核对」，则 loadBreakdownMap 允许进入作答快照
  const verifiedLookup=loadBreakdownMap([{...pendingValidDraft,status:'已核对' as const}]);
  assert.equal(verifiedLookup.size,1);
  const verifiedAttempt=await dispatch(db,'owner','POST','/attempt',submission(25,'C'),{breakdownLookup:verifiedLookup});
  assert.equal(verifiedAttempt.breakdown?.question_id,25);
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
  assert.equal((await call('GET','/link-audit')).find((l:any)=>l.knowledge_id===20002&&l.question_id===24012).status,'已排除');
  assert.ok(!after.links.some((l:any)=>l.knowledge_id===20002&&l.question_id===24012));
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
  const updated={...progress,tab:'知识学习',knowledgeId:10140,knowledgeScope:'point',lastKnowledgeId:10140,introDismissed:true};
  await call('POST','/progress',updated);
  assert.deepEqual((await call('GET','/bootstrap')).progress,updated);
  await assert.rejects(call('POST','/progress',{...updated,lastKnowledgeId:999999}));
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

test('旧数据库升级后保留整卡关联决定和备份恢复能力',async()=>{
  const {call,sqlite,upgrade}=database(false);
  const changedAt='2026-11-18T00:00:00.000Z';
  sqlite.prepare('INSERT INTO link_decision VALUES (?,?,?,?,?,?)')
    .run('owner',20002,24012,'已排除','旧版关联复核',changedAt);
  upgrade();

  const backup=await call('GET','/backup');
  assert.deepEqual(backup.records.link_decision.map((row:object)=>({...row})),[{
    user_id:'owner',knowledge_id:20002,question_id:24012,rule_id:'',status:'已排除',reason:'旧版关联复核',updated_at:changedAt,
  }]);
  delete backup.records.link_decision[0].rule_id;
  await call('POST','/restore',backup);
  const boot=await call('GET','/bootstrap');
  assert.ok(!boot.links.some((link:any)=>link.knowledge_id===20002&&link.question_id===24012));
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

test('排除同卡某一条规则时不影响同卡另一条已确认规则', async () => {
  const { call } = database();
  const auditBefore = await call('GET', '/link-audit');
  const q7RulesBefore = auditBefore.filter((l: any) => l.question_id === 7 && l.knowledge_id === 10144);
  assert.equal(q7RulesBefore.length, 2);
  assert.ok(q7RulesBefore.every((l: any) => l.status === '已确认'));

  await call('POST', '/link', {
    knowledgeId: 10144,
    questionId: 7,
    ruleId: 'RULE-PHIL-DIALECTICAL-NEGATION-01',
    status: '已排除',
    reason: '本题材料未体现辩证否定，排除该规则关联',
  });

  const auditAfter = await call('GET', '/link-audit');
  const rNegation = auditAfter.find((l: any) => l.question_id === 7 && l.knowledge_id === 10144 && l.rule_id === 'RULE-PHIL-DIALECTICAL-NEGATION-01');
  const rFocus = auditAfter.find((l: any) => l.question_id === 7 && l.knowledge_id === 10144 && l.rule_id === 'RULE-PHIL-TWO-POINT-FOCUS-01');
  assert.equal(rNegation?.status, '已排除');
  assert.equal(rFocus?.status, '已确认');

  const boot = await call('GET', '/bootstrap');
  assert.ok(boot.links.some((l: any) => l.question_id === 7 && l.knowledge_id === 10144 && l.status === '已确认'));

  const backup = await call('GET', '/backup');
  assert.ok(backup.records.link_decision.some((l: any) => l.question_id === 7 && l.knowledge_id === 10144 && l.rule_id === 'RULE-PHIL-DIALECTICAL-NEGATION-01'));
  await call('POST', '/restore', backup);
  const auditRestored = await call('GET', '/link-audit');
  assert.equal(auditRestored.find((l: any) => l.question_id === 7 && l.knowledge_id === 10144 && l.rule_id === 'RULE-PHIL-DIALECTICAL-NEGATION-01')?.status, '已排除');
  assert.equal(auditRestored.find((l: any) => l.question_id === 7 && l.knowledge_id === 10144 && l.rule_id === 'RULE-PHIL-TWO-POINT-FOCUS-01')?.status, '已确认');
});

test('旧整卡关联决定先于具体规则应用，逆序返回时具体规则仍优先', async () => {
  const { db, sqlite, call } = database();
  // 插入两条记录：一条具体规则确认，一条旧整卡排除
  sqlite.prepare(`
    INSERT INTO link_decision(user_id, knowledge_id, question_id, rule_id, status, reason, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('owner', 10144, 7, 'RULE-PHIL-TWO-POINT-FOCUS-01', '已确认', '具体规则恢复已确认', '2026-11-17T20:00:00.000Z');

  sqlite.prepare(`
    INSERT INTO link_decision(user_id, knowledge_id, question_id, rule_id, status, reason, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('owner', 10144, 7, '', '已排除', '历史整卡排除', '2026-11-17T19:00:00.000Z');

  const audit = await call('GET', '/link-audit');
  const rFocus = audit.find((l: any) => l.question_id === 7 && l.knowledge_id === 10144 && l.rule_id === 'RULE-PHIL-TWO-POINT-FOCUS-01');
  const rNegation = audit.find((l: any) => l.question_id === 7 && l.knowledge_id === 10144 && l.rule_id === 'RULE-PHIL-DIALECTICAL-NEGATION-01');

  // 具体规则已确认必须优先，旧整卡排除仅覆盖未指定单规则的项
  assert.equal(rFocus?.status, '已确认');
  assert.equal(rNegation?.status, '已排除');

  // 严格验证逆序返回场景：包装底层 db.prepare，故意反转 link_decision 查询结果
  const originalPrepare = db.prepare;
  const reverseDb: any = {
    ...db,
    prepare(sql: string) {
      const stmt = originalPrepare.call(db, sql);
      return {
        ...stmt,
        bind(...args: any[]) {
          stmt.bind(...args);
          return this;
        },
        async first() {
          return stmt.first();
        },
        async run() {
          return stmt.run();
        },
        async all() {
          const res = await stmt.all();
          if (sql.includes('link_decision') && Array.isArray(res.results)) {
            return { results: [...res.results].reverse() };
          }
          return res;
        }
      };
    }
  };
  const reversedAudit = await dispatch(reverseDb, 'owner', 'GET', '/link-audit');
  const revFocus = reversedAudit.find((l: any) => l.question_id === 7 && l.knowledge_id === 10144 && l.rule_id === 'RULE-PHIL-TWO-POINT-FOCUS-01');
  const revNegation = reversedAudit.find((l: any) => l.question_id === 7 && l.knowledge_id === 10144 && l.rule_id === 'RULE-PHIL-DIALECTICAL-NEGATION-01');
  assert.equal(revFocus?.status, '已确认', '逆序返回时具体规则被旧整卡决定错误覆盖！');
  assert.equal(revNegation?.status, '已排除');
});

test('2024年上午卷45题可作答并查看逐项解析，争议题不进入复习',async()=>{
  const {call}=database();
  const questions=catalog.questions.filter(q=>q.exam==='2024年上午卷');
  assert.equal(questions.length,45);
  const results=new Map<number,any>();
  for(const q of questions){
    const result=await call('POST','/attempt',submission(q.id,q.id===24014?'D':q.answer));
    assert.equal(result.breakdown?.question_id,q.id);
    results.set(q.id,result);
  }
  const disputed=[24003,24031,24037,24039,24040,24045];
  assert.deepEqual([...results.keys()].filter(id=>results.get(id).disputed),disputed);
  assert.equal([...results.values()].reduce((total,r)=>total+r.breakdown.items.length,0),134);
  const count=results.get(24014);
  const feedback=buildAnswerFeedback(count.breakdown,'D',count.answer);
  assert.match(count.direct,/原解析以①成立/);
  assert.match(feedback.headline,/你选了 0 项，正确数量为 1 项/);
  assert.deepEqual(feedback.sections[0].items.map(item=>item.key),['②']);
  const date=results.get(24031);
  assert.equal(date.answer,'A');
  assert.equal(date.breakdown.items[0].statement_truth,false);
  assert.equal(date.breakdown.items[0].matches_stem,null);
  assert.match(date.breakdown.items[0].basis,/8 月 29 日/);
  assert.ok(results.get(24027).breakdown.items.every((item:any)=>item.knowledge_id===null&&item.basis));
  const boot=await call('GET','/bootstrap');
  assert.ok(boot.reviews.some((r:{item_id:number})=>r.item_id===24014));
  assert.ok(boot.reviews.every((r:{item_id:number})=>!disputed.includes(r.item_id)));
});
