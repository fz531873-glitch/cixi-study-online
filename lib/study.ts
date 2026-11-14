import { z } from 'zod';
import seed from '../data/catalog.json' with { type: 'json' };
import simulations from '../data/simulations.json' with { type: 'json' };
import { memorySnapshot, Rating, reviewMemory, today } from './memory.ts';
import { reviewBatchLimit, type ReviewBatch } from './review-batch.ts';

export { today };

export const catalog = {...seed, generated: simulations.generated,
  questions: [...seed.questions, ...simulations.questions],
  knowledge: [...seed.knowledge, ...simulations.knowledge], links: [...seed.links, ...simulations.links]};
const contentLimit = catalog.questions.length + catalog.knowledge.length;

export class InputError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status=status; }
}
const id = z.number().int().positive();
const short = z.string().trim().min(1).max(400);
const status = z.enum(['待核对', '已核对', '争议']);
const answer = z.string().regex(/^[ABCD]{1,4}$/).refine(s => new Set(s).size === s.length, '答案不能重复');
const questionEdit = z.object({body: z.string().trim().min(10).max(16000), answer,
  analysis: z.string().trim().min(10).max(30000), direct: z.string().trim().min(12).max(3000),
  type: z.enum(['单选', '多选', '判断']), status, note: z.string().max(3000),
  source_page: id.max(500), analysis_page: id.max(500)});
const knowledgeEdit = z.object({title: short, content: z.string().trim().min(5).max(20000),
  question: short, status, source: short, page: id.max(500)});
const reviewBatchSchema: z.ZodType<ReviewBatch> = z.object({
  items: z.array(z.object({kind: z.enum(['question', 'knowledge']), item_id: id})).min(1).max(reviewBatchLimit),
  index: z.number().int().nonnegative(),
  recalled: z.boolean().optional(),
}).refine(batch => batch.index <= batch.items.length && (!batch.recalled || batch.items[batch.index]?.kind === 'knowledge'))
  .refine(batch => new Set(batch.items.map(item=>item.kind+':'+item.item_id)).size===batch.items.length &&
    batch.items.every(({kind,item_id})=>(kind==='question' ? catalog.questions : catalog.knowledge).some(item=>item.id===item_id)),
    '复习批次包含重复或不存在的项目');

export const progressSchema = z.object({tab: z.enum(['今日学习','知识学习','真题练习','复习中心','学习记录','资料纠错','原始资料']),
  knowledgeId: id, questionId: id, answer: z.array(z.enum(['A','B','C','D'])).max(4),
  confidence: z.enum(['未选择','确定','犹豫','猜的']), mode: z.enum(['全部','学后','错题','混合']), queue: z.array(id).max(catalog.questions.length), exam: z.string().max(100), submittedId:z.string().uuid().nullable().default(null), knowledgeScope:z.enum(['category','point']).default('category'),
  reviewBatch: reviewBatchSchema.optional(),
});
export type Progress = z.infer<typeof progressSchema>;
type Row = Record<string, unknown>;
const tables = ['attempt','recall','review','progress','content_edit','content_history','link_decision'] as const;
async function rows(db: D1Database, sql: string, ...args: (string|number)[]) { return (await db.prepare(sql).bind(...args).all<Row>()).results; }
export async function content(db: D1Database, user: string) {
  const changes = await rows(db, 'SELECT kind,item_id,payload,revision FROM content_edit WHERE user_id=?', user);
  const q = new Map<number, any>(catalog.questions.map(q => [q.id, {...q}]));
  const k = new Map<number, any>(catalog.knowledge.map(k => [k.id, {...k, version: 1}]));
  for (const row of changes) {
    const target = row.kind === 'question' ? q : k, item = target.get(Number(row.item_id));
    if (item) target.set(item.id, {...item, ...JSON.parse(String(row.payload)), version: Number(row.revision)});
  }
  return {questions: [...q.values()], knowledge: [...k.values()]};
}
async function decisions(db: D1Database, user: string) {
  const result = new Map(catalog.links.map(l => [l.knowledge_id+'-'+l.question_id, {...l}]));
  for (const l of await rows(db, 'SELECT * FROM link_decision WHERE user_id=?', user)) result.set(l.knowledge_id+'-'+l.question_id, {...l} as any);
  return [...result.values()];
}
function checkAnswer(type: string, value: string) {
  if ((type === '单选' || type === '判断') && value.length !== 1) throw new InputError('本题只能选择一项');
  if (type === '判断' && !['A','D'].includes(value)) throw new InputError('判断题选择A（正确）或D（错误）');
}
async function schedule(db: D1Database, user: string, kind: 'question' | 'knowledge', item: number, grade: Rating.Again | Rating.Hard | Rating.Good, now: string) {
  const previous = await db.prepare('SELECT memory FROM review WHERE user_id=? AND kind=? AND item_id=?')
    .bind(user, kind, item).first<{memory: string | null}>();
  const next = reviewMemory(previous?.memory ?? null, new Date(now), grade);
  if (!next) return null;
  // A stale concurrent review must roll back its log instead of replacing newer state.
  return db.prepare(`INSERT INTO review(user_id,kind,item_id,due_date,stage,memory) VALUES (?,?,?,?,0,?)
    ON CONFLICT(user_id,kind,item_id) DO UPDATE SET
      due_date=CASE WHEN review.memory IS ? THEN excluded.due_date END,
      memory=excluded.memory`)
    .bind(user, kind, item, next.dueDate, next.memory, previous?.memory ?? null);
}
function stripAnswer(q: any) { const {answer, analysis, direct, references, note, ...visible} = q; return visible; }
const attemptSchema = z.object({questionId: id, answer, confidence: z.enum(['确定','犹豫','猜的']), requestId: z.string().uuid()});
const dateString = z.string().refine(s => !isNaN(Date.parse(s)), '日期无效');
const backups = z.object({format: z.literal('cixi-study-v1'), version: z.literal('1.0.0'), exported_at: dateString,
  catalog: z.object({version: z.literal('1.0.0'), questions: z.array(z.object({id})).min(seed.questions.length).max(catalog.questions.length), knowledge: z.array(z.object({id})).min(seed.knowledge.length).max(catalog.knowledge.length)}).passthrough(),
  records: z.object({
    attempt: z.array(z.object({id: z.string().uuid(), question_id: id, answer, confidence: z.enum(['确定','犹豫','猜的']), correct: z.number().int().min(0).max(1), disputed: z.number().int().min(0).max(1), error_reason: z.string().max(400), kind: z.enum(['首次','重复']), snapshot: z.string().max(50000).refine(s=>{try{return questionEdit.safeParse(JSON.parse(s)).success}catch{return false}}, '作答快照无效'), created_at: dateString})).max(10000),
    recall: z.array(z.object({id: z.string().uuid(), knowledge_id: id, rating: z.enum(['记住了','记住一部分','还没记住']), created_at: dateString})).max(10000),
    review: z.array(z.object({kind: z.enum(['question','knowledge']), item_id: id, due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), stage: z.number().int().min(0).max(3), memory: memorySnapshot.nullish()})).max(contentLimit),
    progress: z.array(z.object({payload: z.string().max(12000).refine(s=>{try{return progressSchema.safeParse(JSON.parse(s)).success}catch{return false}}), updated_at: dateString})).max(1),
    content_edit: z.array(z.object({kind:z.enum(['question','knowledge']), item_id:id, payload:z.string().max(60000), revision:id, updated_at:dateString})).max(contentLimit),
    content_history: z.array(z.object({id:z.string().uuid(), kind:z.enum(['question','knowledge']), item_id:id, payload:z.string().max(60000), reason:short, revision:id, created_at:dateString})).max(5000),
    link_decision: z.array(z.object({knowledge_id:id, question_id:id, status:z.enum(['已确认','已排除','候选']), reason:short, updated_at:dateString})).max(5000),
  })});

export async function dispatch(db: D1Database, user: string, method: string, path: string, input?: unknown): Promise<any> {
  if (!user) throw new InputError('请先登录', 401);
  const now = new Date().toISOString();
  if (method === 'GET' && path === '/bootstrap') {
    const [{questions,knowledge},links,reviews,attempts,progress] = await Promise.all([
      content(db,user), decisions(db,user), rows(db,'SELECT kind,item_id,due_date,stage FROM review WHERE user_id=? ORDER BY due_date,kind,item_id',user),
      rows(db,'SELECT id,question_id,answer,confidence,correct,disputed,error_reason,kind,created_at FROM attempt WHERE user_id=? ORDER BY created_at DESC',user),
      db.prepare('SELECT payload,updated_at FROM progress WHERE user_id=?').bind(user).first<{payload:string;updated_at:string}>(),
    ]);
    return {questions:questions.map(stripAnswer), knowledge, links, reviews, attempts, materials:catalog.materials,
      progress:progress ? JSON.parse(progress.payload) : null, progress_updated_at:progress?.updated_at, today:today(), version:catalog.version};
  }
  if (method === 'POST' && path === '/progress') {
    const p = progressSchema.parse(input);
    if (!catalog.questions.some(q=>q.id===p.questionId) || !catalog.knowledge.some(k=>k.id===p.knowledgeId) || !p.queue.every(id=>catalog.questions.some(q=>q.id===id))) throw new InputError('学习位置不存在');
    await db.prepare('INSERT INTO progress VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(user,JSON.stringify(p),now).run();
    return {saved:true};
  }
  if (method === 'POST' && path === '/attempt') {
    const a = attemptSchema.parse(input), {questions} = await content(db,user), q = questions.find(q=>q.id===a.questionId);
    if (!q) throw new InputError('题目不存在',404);
    checkAnswer(q.type,a.answer);
    const existing = await db.prepare('SELECT * FROM attempt WHERE id=? AND user_id=?').bind(a.requestId,user).first<any>();
    if (existing) {
      if (existing.question_id!==a.questionId || existing.answer!==[...a.answer].sort().join('') || existing.confidence!==a.confidence) throw new InputError('该提交编号已用于其他作答',409);
      return {...JSON.parse(existing.snapshot), id:existing.id, questionId:existing.question_id, correct:!!existing.correct, disputed:!!existing.disputed};
    }
    const normalized = [...a.answer].sort().join(''), correct = normalized === [...q.answer].sort().join(''), disputed = q.status === '争议';
    const statements = [db.prepare("INSERT INTO attempt(id,user_id,question_id,answer,confidence,correct,disputed,kind,snapshot,created_at) SELECT ?,?,?,?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM attempt WHERE user_id=? AND question_id=?) THEN '重复' ELSE '首次' END,?,?")
      .bind(a.requestId,user,q.id,normalized,a.confidence,Number(correct),Number(disputed),user,q.id,JSON.stringify(q),now)];
    if (!disputed) {
      const grade = !correct || a.confidence==='猜的' ? Rating.Again : a.confidence==='犹豫' ? Rating.Hard : Rating.Good;
      const review = await schedule(db,user,'question',q.id,grade,now);
      if (review) statements.push(review);
    }
    await db.batch(statements);
    return {...q,id:a.requestId,questionId:q.id,correct,disputed};
  }
  if (method === 'POST' && path === '/reason') {
    const a = z.object({id:z.string().uuid(), reason:z.enum(['知识没记住','概念混淆','条件理解错误','漏看关键词','推理方法不熟','没有把握','其他'])}).parse(input);
    const r = await db.prepare('UPDATE attempt SET error_reason=? WHERE id=? AND user_id=?').bind(a.reason,a.id,user).run();
    if (!r.meta.changes) throw new InputError('作答记录不存在',404);
    return {saved:true};
  }
  if (method === 'GET' && /^\/attempt\/[0-9a-f-]{36}$/.test(path)) {
    const saved=await db.prepare('SELECT * FROM attempt WHERE id=? AND user_id=?').bind(path.split('/').pop()!,user).first<any>();
    if(!saved)throw new InputError('作答记录不存在',404);
    return {...JSON.parse(saved.snapshot),id:saved.id,questionId:saved.question_id,correct:!!saved.correct,disputed:!!saved.disputed};
  }
  if (method === 'POST' && path === '/recall') {
    const a = z.object({knowledgeId:id, rating:z.enum(['记住了','记住一部分','还没记住'])}).parse(input);
    if (!catalog.knowledge.some(k=>k.id===a.knowledgeId)) throw new InputError('知识不存在',404);
    const grade = a.rating==='还没记住' ? Rating.Again : a.rating==='记住一部分' ? Rating.Hard : Rating.Good;
    const review = await schedule(db,user,'knowledge',a.knowledgeId,grade,now);
    const statements = [db.prepare('INSERT INTO recall VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),user,a.knowledgeId,a.rating,now)];
    if (review) statements.push(review);
    await db.batch(statements);
    return {saved:true};
  }
  if (method === 'GET' && /^\/editor\/question\/\d+$/.test(path)) {
    const {questions} = await content(db,user), q = questions.find(q=>q.id===Number(path.split('/').pop()));
    if (!q) throw new InputError('题目不存在',404);
    return q;
  }
  if (method === 'POST' && path === '/edit') {
    const a = z.object({kind:z.enum(['question','knowledge']), itemId:id, version:id, payload:z.unknown(), reason:short}).parse(input);
    const payload = a.kind==='question' ? questionEdit.parse(a.payload) : knowledgeEdit.parse(a.payload);
    if (a.kind==='question') checkAnswer((payload as any).type,(payload as any).answer);
    const records = await content(db,user), old = (a.kind==='question'?records.questions:records.knowledge).find(item=>item.id===a.itemId);
    if (!old) throw new InputError('内容不存在',404);
    if (old.version!==a.version) throw new InputError('内容已在其他页面更新，请重新载入后再保存',409);
    await db.prepare('INSERT OR IGNORE INTO content_edit VALUES (?,?,?,?,?,?)').bind(user,a.kind,a.itemId,JSON.stringify(old),1,now).run();
    const result = await db.batch([
      db.prepare('INSERT INTO content_history SELECT ?,user_id,kind,item_id,payload,?,revision,? FROM content_edit WHERE user_id=? AND kind=? AND item_id=? AND revision=?')
        .bind(crypto.randomUUID(),a.reason,now,user,a.kind,a.itemId,a.version),
      db.prepare('UPDATE content_edit SET payload=?,revision=revision+1,updated_at=? WHERE user_id=? AND kind=? AND item_id=? AND revision=?')
        .bind(JSON.stringify(payload),now,user,a.kind,a.itemId,a.version),
    ]);
    if (!result[1].meta.changes) throw new InputError('内容刚被更新，请重新载入',409);
    return {saved:true,version:a.version+1};
  }
  if (method === 'POST' && path === '/link') {
    const a = z.object({knowledgeId:id, questionId:id, status:z.enum(['候选','已确认','已排除']), reason:short}).parse(input);
    if (!catalog.knowledge.some(k=>k.id===a.knowledgeId) || !catalog.questions.some(q=>q.id===a.questionId)) throw new InputError('知识或题目不存在',404);
    await db.prepare('INSERT INTO link_decision VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,knowledge_id,question_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,updated_at=excluded.updated_at')
      .bind(user,a.knowledgeId,a.questionId,a.status,a.reason,now).run();
    return {saved:true};
  }
  if (method === 'GET' && path === '/history') return rows(db,'SELECT kind,item_id,reason,revision,created_at FROM content_history WHERE user_id=? ORDER BY created_at DESC',user);
  if (method === 'GET' && path === '/backup') {
    const entries = await Promise.all(tables.map(async t=>[t,await rows(db,`SELECT * FROM ${t} WHERE user_id=?`,user)]));
    return {format:'cixi-study-v1',version:catalog.version,exported_at:now,catalog,records:Object.fromEntries(entries)};
  }
  if (method === 'POST' && path === '/restore') {
    const data = backups.parse(input), qids = new Set(catalog.questions.map(q=>q.id)), kids = new Set(catalog.knowledge.map(k=>k.id));
    const matches = (items:{id:number}[], expected:{id:number}[]) => items.length===expected.length && new Set(items.map(x=>x.id)).size===expected.length && expected.every(x=>items.some(item=>item.id===x.id));
    const legacy = matches(data.catalog.questions,seed.questions) && matches(data.catalog.knowledge,seed.knowledge);
    const current = matches(data.catalog.questions,catalog.questions) && matches(data.catalog.knowledge,catalog.knowledge);
    if (!legacy && !current) throw new InputError('备份资料版本与当前题库不匹配');
    for (const a of data.records.attempt) if (!qids.has(a.question_id)) throw new InputError('备份中有未知题目');
    for (const r of data.records.recall) if (!kids.has(r.knowledge_id)) throw new InputError('备份中有未知知识');
    for (const r of data.records.review) if (!(r.kind==='question'?qids:kids).has(r.item_id)) throw new InputError('备份复习对象无效');
    for (const t of ['content_edit','content_history'] as const) for (const e of data.records[t]) {
      if (!(e.kind==='question'?qids:kids).has(e.item_id)) throw new InputError('备份修改对象无效');
      const parsed = (e.kind==='question'?questionEdit:knowledgeEdit).parse(JSON.parse(e.payload));
      if (e.kind==='question') checkAnswer((parsed as any).type,(parsed as any).answer);
    }
    for (const l of data.records.link_decision) if (!qids.has(l.question_id)||!kids.has(l.knowledge_id)) throw new InputError('备份关联无效');
    const columns: Record<typeof tables[number],string[]> = {
      attempt:['id','question_id','answer','confidence','correct','disputed','error_reason','kind','snapshot','created_at'],
      recall:['id','knowledge_id','rating','created_at'],review:['kind','item_id','due_date','stage','memory'],progress:['payload','updated_at'],
      content_edit:['kind','item_id','payload','revision','updated_at'],content_history:['id','kind','item_id','payload','reason','revision','created_at'],
      link_decision:['knowledge_id','question_id','status','reason','updated_at'],
    };
    const statements = tables.map(t=>db.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(user));
    for (const t of tables) {
      const cols = columns[t];
      statements.push(db.prepare(`INSERT INTO ${t}(user_id,${cols.join(',')}) SELECT ?,${cols.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?)`).bind(user,JSON.stringify(data.records[t])));
    }
    await db.batch(statements);
    return {restored:true};
  }
  throw new InputError('接口不存在',404);
}
