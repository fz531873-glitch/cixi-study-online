type Attempt = {question_id:number; kind:string; disputed:number; created_at:string};
type Recall = {knowledge_id:number; first_at:string; last_at:string};
type Review = {kind:string; item_id:number; due_date:string};
type Question = {id:number; kind?:string; status:string};

export function dailyPlan(date:string, questions:Question[], attempts:Attempt[], recalls:Recall[], due:Review[]) {
  const start = new Date(date+'T00:00:00+08:00').toISOString();
  const end = new Date(Date.parse(start)+86_400_000).toISOString();
  const isToday = (time:string) => time>=start && time<end;
  const attempted = new Set(attempts.map(a=>a.question_id));
  const seenBefore = new Set(attempts.filter(a=>a.created_at<start).map(a=>a.question_id));
  const eligible = new Set(questions.filter(q=>q.kind!=='模拟题'&&q.status!=='争议').map(q=>q.id));
  const newDone = new Set(attempts.filter(a=>isToday(a.created_at)&&a.kind==='首次'&&!a.disputed&&eligible.has(a.question_id)).map(a=>a.question_id));
  const reviewed = new Set(attempts.filter(a=>isToday(a.created_at)&&seenBefore.has(a.question_id)&&!a.disputed).map(a=>'question:'+a.question_id));
  for (const recall of recalls) {
    if (recall.first_at<start && isToday(recall.last_at)) reviewed.add('knowledge:'+recall.knowledge_id);
  }
  const pending = due.filter(r=>!reviewed.has(r.kind+':'+r.item_id));
  const fresh = questions.filter(q=>eligible.has(q.id)&&!attempted.has(q.id)).slice(0,Math.max(0,20-newDone.size));
  const includesKnowledge = pending.some(r=>r.kind==='knowledge')||[...reviewed].some(key=>key.startsWith('knowledge:'));
  return {pending, fresh, done:newDone.size+reviewed.size, reviewTotal:pending.length+reviewed.size, newTotal:fresh.length+newDone.size, includesKnowledge};
}
