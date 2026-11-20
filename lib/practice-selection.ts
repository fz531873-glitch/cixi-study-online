type Question = {id:number; exam:string; number:number; type:string; status:string; category?:string};
type Knowledge = {id:number; category:string};
type Link = {knowledge_id:number; question_id:number; status:string};

export const mixedCounts = [10,20,45] as const;
export const questionTypes = ['单选','多选','判断'] as const;

export function questionsForPaper<T extends Question>(questions:T[], exam:string) {
  return questions.filter(q=>!exam||q.exam===exam).sort((a,b)=>exam?a.number-b.number:0);
}

export function questionsForMix<T extends Question>(
  questions:T[], knowledge:Knowledge[], links:Link[], attempted:ReadonlySet<number>,
  filters:{categories:readonly string[]; types:readonly string[]; unseen:boolean},
) {
  const categories=new Set(filters.categories), types=new Set(filters.types);
  const knowledgeById=new Map(knowledge.map(k=>[k.id,k.category]));
  const linked=new Set(links.filter(l=>l.status==='已确认'&&categories.has(knowledgeById.get(l.knowledge_id)??'')).map(l=>l.question_id));
  return questions.filter(q=>q.status!=='争议'&&(!filters.unseen||!attempted.has(q.id))&&
    (!types.size||types.has(q.type))&&(!categories.size||categories.has(q.category??'')||linked.has(q.id)));
}

export function sampleQuestions<T>(questions:readonly T[], count:number) {
  const shuffled=[...questions];
  for(let i=shuffled.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
  }
  return shuffled.slice(0,count);
}
