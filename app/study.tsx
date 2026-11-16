'use client';
import {useEffect, useEffectEvent, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, BarChart3, BookOpen, CalendarDays, Check, ChevronDown, FileText, Info, Layers, RefreshCw, TriangleAlert, X} from 'lucide-react';
import {Switch} from '../components/ui/switch';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '../components/ui/select';
import {nextDate, reviewBatchLimit, reviewDateLabel, type ReviewBatch, type ReviewItem} from '../lib/review-batch';
import type {Progress} from '../lib/study';
import {dailyQuote} from '../lib/daily-quote';
import {dailyPlan} from '../lib/daily-plan';
import {mistakeReasons, storedMistakeReasons} from '../lib/mistake-reasons';
import {formatQuestionAnalysis, formatQuestionText, optionLetters, splitQuestionOptions} from '../lib/question-options';

type Q = {id:number; exam:string; number:number; type:string; body:string; status:string; note:string; source_page:number; analysis_page:number; question_material:number; analysis_material:number; image:string; version:number; explanation_source:string; kind?:string; simulation_id?:string};
type K = {id:number; title:string; category:string; chapter:string; module:string; content:string; question:string; source:string; material:number; page:number; status:string; version:number};
type Link = {knowledge_id:number; question_id:number; status:string; reason:string};
type Attempt = {id:string; question_id:number; answer:string; confidence:string; correct:number; disputed:number; error_reason:string; kind:string; created_at:string};
type Boot = {questions:Q[]; knowledge:K[]; links:Link[]; materials:{id:number;name:string;url:string}[]; reviews:(ReviewItem&{due_date:string;stage:number})[]; attempts:Attempt[]; recalls:{knowledge_id:number;first_at:string;last_at:string}[]; progress:Progress|null; progress_updated_at?:string; today:string};
type Result = Omit<Q,'id'> & {id:string; questionId:number; correct:boolean; disputed:boolean; answer:string; direct:string; analysis:string; references:{title:string;url:string}[]};
const confidenceLevels = ['确定','犹豫','猜的'] as const;
type Submission = {questionId:number; answer:string; confidence:typeof confidenceLevels[number]; requestId:string};
const initial:Progress = {tab:'今日学习',knowledgeId:20002,questionId:13,answer:[],confidence:'未选择',mode:'全部',queue:[],exam:'2025年上午卷',submittedId:null,knowledgeScope:'category'};
const tabs = ['今日学习','知识学习','真题练习','复习中心','学习记录','资料纠错','原始资料'] as const;
const navIcons = [CalendarDays,BookOpen,Layers,RefreshCw,BarChart3,TriangleAlert,FileText];
const mobileLabels = ['今日','学习','练习','复习'];
const practiceModes = [['全部','按来源'],['混合','混合练习'],['错题','错题与犹豫题']] as const;
const paperName=(exam:string)=>exam==='2019年7月象山事业单位'?'2019年7月卷（象山）':exam;
const reviewTab=(item:ReviewItem)=>item.kind==='question'?'真题练习':'知识学习';
const tabName=(tab:string)=>tab==='真题练习'?'题库练习':tab;
const categoryNames:Record<string,string>={'经济学':'经济','管理学':'管理','马克思主义原理':'马原'};
const categoryName=(category:string)=>categoryNames[category]||category;
async function api<T>(path:string, body?:unknown):Promise<T> {
  const r=await fetch('/api'+path, body===undefined ? {cache:'no-store'} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if (r.status===401) throw new Error('登录已过期，请刷新页面后重新登录。');
  const data:any=await r.json();
  if(!r.ok) throw new Error(data.detail||'读取或保存失败，请重试。');
  return data;
}
function download(name:string, data:unknown) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
export default function Study({userName}:{userName:string}) {
  const [data,setData]=useState<Boot|null>(null), [p,setP]=useState<Progress>(initial), [ready,setReady]=useState(false);
  const [phase,setPhase]=useState<'read'|'recall'|'check'>('read'), [result,setResult]=useState<Result|null>(null);
  const [setup,setSetup]=useState(false), [setupExam,setSetupExam]=useState(initial.exam);
  const [setupMode,setSetupMode]=useState<Exclude<Progress['mode'],'学后'>>('全部');
  const [showGrid,setShowGrid]=useState(false), [hideAnalysis,setHideAnalysis]=useState(true);
  const [preview,setPreview]=useState<(Q & {answer:string;direct:string})|null>(null);
  const [message,setMessage]=useState(''), [busy,setBusy]=useState(false), [syncError,setSyncError]=useState('');
  const [reviewDate,setReviewDate]=useState('');
  const [viewed,setViewed]=useState<number[]>([]);
  const saveQueue=useRef(Promise.resolve());
  const [daily,setDaily]=useState<ReturnType<typeof dailyQuote>|null>(null);
  const [search,setSearch]=useState(''), [future,setFuture]=useState(false), [material,setMaterial]=useState(0);
  const [editKind,setEditKind]=useState<'question'|'knowledge'>('question'), [editor,setEditor]=useState<any>(null), [reason,setReason]=useState('');
  const [linkQ,setLinkQ]=useState(24012), [linkReason,setLinkReason]=useState(''), [pending,setPending]=useState<any>(null);
  const [history,setHistory]=useState<any[]>([]), pendingSubmission=useRef<Submission|null>(null), progressRef=useRef(p), dirty=useRef(false);
  const storageKey='cixi-v1-progress:'+userName;
  const refreshVersion=useRef(0);
  const refresh=async()=>{const version=++refreshVersion.current;const b=await api<Boot>('/bootstrap');if(version===refreshVersion.current)setData(b);return b};
  useEffect(()=>{const update=()=>{const next=dailyQuote();setDaily(previous=>previous?.date===next.date?previous:next)};update();const timer=setInterval(update,60000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update)}},[]);
  useEffect(()=>{let live=true;api<Boot>('/bootstrap').then(async b=>{
    if(!live)return;setData(b);let restored=b.progress;
    try {const local=JSON.parse(localStorage.getItem(storageKey)||'null');if(local?.value && local.updated>(b.progress_updated_at||'') && b.questions.some(q=>q.id===local.value.questionId) && b.knowledge.some(k=>k.id===local.value.knowledgeId))restored=local.value;}catch{}
    if(restored?.submittedId){try{const previous=await api<Result>('/attempt/'+restored.submittedId);if(live&&previous.questionId===restored.questionId)setResult(previous)}catch{restored={...restored,submittedId:null,answer:[]}}}
    if(live){
      const batch=restored?.reviewBatch;
      if(batch?.items[batch.index]?.kind==='knowledge')setPhase(batch.recalled?'check':'recall');
      try{const saved:unknown=JSON.parse(sessionStorage.getItem(storageKey+':preview')||'[]');if(Array.isArray(saved))setViewed(saved.filter(Number.isInteger))}catch{}
      setP(restored||initial);setReady(true);
    }
  }).catch(e=>setMessage(e.message));return()=>{live=false}},[storageKey]);
  useEffect(()=>{progressRef.current=p;if(!ready)return;
    let local=true;
    try{localStorage.setItem(storageKey,JSON.stringify({value:p,updated:new Date().toISOString()}));}catch{local=false}
    dirty.current=true;
    const timer=setTimeout(()=>{
      saveQueue.current=saveQueue.current.then(async()=>{
        if(progressRef.current!==p)return;
        try {
          await api('/progress',p);
          if(progressRef.current===p){dirty.current=false;setSyncError('')}
        } catch {
          if(progressRef.current===p)setSyncError(local?'云端同步失败，草稿已留在本机。':'进度保存失败。请重试成功后再退出。');
        }
      });
    },550);
    return()=>clearTimeout(timer);
  },[p,ready,storageKey]);
  useEffect(()=>{
    const save=()=>{if(ready&&dirty.current)navigator.sendBeacon('/api/progress',JSON.stringify(progressRef.current))};
    const reload=()=>{if(ready&&document.visibilityState==='visible')void refresh().catch(()=>{})};
    window.addEventListener('pagehide',save);
    window.addEventListener('focus',reload);
    document.addEventListener('visibilitychange',reload);
    return()=>{window.removeEventListener('pagehide',save);window.removeEventListener('focus',reload);document.removeEventListener('visibilitychange',reload)};
  },[ready]);
  useEffect(()=>{window.scrollTo(0,0)},[p.tab,p.questionId,p.knowledgeId]);
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await action()}catch(e){setMessage(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}};
  const patch=(v:Partial<Progress>)=>{setP(prev=>({...prev,...v}));setMessage('')};
  const chooseK=(id:number,recall=false,scope:Progress['knowledgeScope']='point')=>{patch({knowledgeId:id,tab:'知识学习',knowledgeScope:scope,reviewBatch:undefined});setHideAnalysis(true);setSearch('');setPhase(recall?'recall':'read')};
  const go=(id:number,opts:Partial<Progress>={})=>{patch({questionId:id,tab:'真题练习',answer:[],confidence:'未选择',submittedId:null,reviewBatch:undefined,...(opts.mode==='学后'?{exam:''}:{}),...opts});setResult(null);setSetup(false);setShowGrid(false);pendingSubmission.current=null;};
  const move=(offset:number)=>{
    const item=p.reviewBatch?.items[p.reviewBatch.index];
    if (!data || busy || (item?.kind==='question'&&item.item_id===p.questionId)) return;
    const ids=p.mode==='全部'?data.questions.filter(q=>!p.exam||q.exam===p.exam).map(q=>q.id):p.queue;
    const target=ids[ids.indexOf(p.questionId)+offset];
    if(target) {go(target);window.scrollTo(0,0);}
  };
  const selectAnswer=(letter:typeof optionLetters[number], type:string)=>{
    if (busy || result || !hideAnalysis || viewed.includes(p.questionId)) return;
    setP(previous=>({...previous,answer:type==='多选'?(previous.answer.includes(letter)?previous.answer.filter(x=>x!==letter):[...previous.answer,letter]):[letter]}));
    setMessage('');
  };
  const submit=(confidence:Submission['confidence'])=>run(async()=>{
    if(viewed.includes(p.questionId))throw new Error('本题已查看解析，请继续下一题。');
    if(!p.answer.length)throw new Error('请先选择答案。');
    const answer=[...p.answer].sort().join('');
    const previous=pendingSubmission.current;
    // A network error can occur after the server saved the attempt.
    if(previous?.questionId===p.questionId&&(previous.answer!==answer||previous.confidence!==confidence))
      throw new Error('上次提交结果未确认，请用原答案 '+previous.answer+' 和「'+previous.confidence+'」重试。');
    patch({confidence});
    if(!navigator.onLine)throw new Error('当前离线，联网后请重新提交。');
    const attempt=previous?.questionId===p.questionId?previous:{questionId:p.questionId,answer,confidence,requestId:crypto.randomUUID()};
    pendingSubmission.current=attempt;
    const r=await api<Result>('/attempt',attempt);
    if(pendingSubmission.current===attempt&&progressRef.current.questionId===r.questionId){
      pendingSubmission.current=null;
      setResult(r);patch({submittedId:r.id});
    }
    await refresh();
  });
  const handlePracticeKey=useEffectEvent((event:KeyboardEvent)=>{
    const target=event.target instanceof HTMLElement?event.target:null;
    if (p.tab!=='真题练习'||setup||!ready||!data||busy||event.defaultPrevented||event.isComposing||event.repeat
      ||event.ctrlKey||event.metaKey||event.altKey||target?.closest('input,textarea,select,[contenteditable],dialog')) return;
    const question=data.questions.find(q=>q.id===p.questionId);
    if (!question) return;
    const letters=question.type==='判断'?(['A','D'] as const):optionLetters;
    const key=/^[1-4]$/.test(event.key)?optionLetters[Number(event.key)-1]:event.key.toUpperCase();
    const letter=letters.find(l=>l===key);
    if (letter && hideAnalysis && !result && !viewed.includes(p.questionId)) {event.preventDefault();selectAnswer(letter,question.type);}
    if (event.key==='ArrowRight' && result && !target?.closest('[aria-label="题号"]')) {
      event.preventDefault();if(reviewingQuestion)nextReview();else move(1);
    }
  });
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>handlePracticeKey(event);
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[]);
  useEffect(()=>{
    if(hideAnalysis || setup || p.tab!=='真题练习' || result) return;
    let active=true;
    api<Q & {answer:string;direct:string}>('/editor/question/'+p.questionId).then(q=>{
      if(!active)return;
      setPreview(q);
      setViewed(ids=>{
        if(ids.includes(q.id))return ids;
        const next=[...ids,q.id];
        try{sessionStorage.setItem(storageKey+':preview',JSON.stringify(next))}catch{}
        return next;
      });
    })
      .catch(e=>{if(active){setHideAnalysis(true);setMessage(e.message)}});
    return ()=>{active=false};
  },[hideAnalysis,setup,p.tab,p.questionId,result,storageKey]);
  if(!data||!ready)return <main className="loading"><h1>慈溪备考</h1><p>{message||'正在打开你的学习空间…'}</p>{message&&<button onClick={()=>location.reload()}>重新载入</button>}</main>;
  const currentQuestion=data.questions.find(q=>q.id===p.questionId)!;
  const mockQuestions=data.questions.filter(q=>q.kind==='模拟题');
  const question=result?.questionId===p.questionId?{...result,id:result.questionId}:currentQuestion, knowledge=data.knowledge.find(k=>k.id===p.knowledgeId)!;
  const options=p.tab==='真题练习'&&question.type!=='判断'?splitQuestionOptions(question.body,question.number):null;
  const categories=[...new Set(data.knowledge.map(k=>k.category))];
  const categoryKnowledge=data.knowledge.filter(k=>k.category===knowledge.category);
  const visibleKnowledge=categoryKnowledge.filter(k=>!search.trim()||k.title.includes(search.trim())||k.content.includes(search.trim()));
  const learningCategory=p.knowledgeScope!=='point', categoryIndex=categoryKnowledge.findIndex(k=>k.id===p.knowledgeId);
  const related=data.links.filter(l=>l.knowledge_id===p.knowledgeId&&l.status==='已确认').map(l=>data.questions.find(q=>q.id===l.question_id)!).filter(Boolean);
  const date=daily?.date||data.today;
  const reviews=data.reviews.filter(r=>r.kind==='question'?data.questions.some(q=>q.id===r.item_id&&q.status!=='争议'):data.knowledge.some(k=>k.id===r.item_id));
  const due=reviews.filter(r=>r.due_date<=date);
  const reviewDays=Array.from({length:7},(_,i)=>{
    const day=nextDate(date,i+1);
    return {day,count:reviews.filter(r=>r.due_date===day).length};
  });
  const reviewPeak=Math.max(1,...reviewDays.map(day=>day.count));
  const reviewGroups=new Map<string,typeof reviews>();
  for(const r of future?reviews:due){
    if(reviewDate&&r.due_date!==reviewDate)continue;
    const group=reviewGroups.get(r.due_date);
    if(group)group.push(r);else reviewGroups.set(r.due_date,[r]);
  }
  const batch=p.reviewBatch, reviewItem=batch?.items[batch.index];
  const reviewingKnowledge=reviewItem?.kind==='knowledge'&&p.tab==='知识学习'&&reviewItem.item_id===p.knowledgeId;
  const reviewingQuestion=reviewItem?.kind==='question'&&p.tab==='真题练习'&&reviewItem.item_id===p.questionId;
  const previewed=viewed.includes(p.questionId);
  const nextScheduled=result&&!result.disputed?reviews.find(r=>r.kind==='question'&&r.item_id===p.questionId)?.due_date:undefined;
  const memoryTip=result?.direct.match(/^([\s\S]*?)记住[：:]\s*([\s\S]+)$/);
  const first=data.attempts.filter(a=>a.kind==='首次'&&!a.disputed), valid=data.attempts.filter(a=>!a.disputed);
  const latest=new Map<number,Attempt>();for(const a of data.attempts)if(!latest.has(a.question_id))latest.set(a.question_id,a);
  const weak=[...latest.values()].filter(a=>!a.disputed&&(!a.correct||a.confidence!=='确定')).map(a=>a.question_id);
  const label=(qid:number)=>{const q=data.questions.find(q=>q.id===qid);return q?`${paperName(q.exam)} · 第${q.number}题 · ${q.type}`:'题目不存在'};
  const pdf=(id:number,page:number)=>`${data.materials.find(m=>m.id===id)?.url||''}#page=${page}`;
  const startLinked=()=>{if(!related.length){setMessage('题库暂未覆盖当前知识的已确认关联，可以先完成回忆。');return}go(related[0].id,{mode:'学后',queue:related.map(q=>q.id)})};
  const papers=[...new Set(data.questions.filter(q=>q.kind!=='模拟题').map(q=>q.exam))].sort((a,b)=>b.localeCompare(a,'zh-CN'));
  const mockSources=[...new Set(mockQuestions.map(q=>q.exam))];
  const sourceInfo=(exam:string)=>{
    const items=data.questions.filter(q=>!exam||q.exam===exam);
    return items.length+' 题 · 已做 '+items.filter(q=>latest.has(q.id)).length;
  };
  const available=p.mode==='全部'?data.questions.filter(q=>!p.exam||q.exam===p.exam):p.queue.map(id=>data.questions.find(q=>q.id===id)!).filter(Boolean);
  const questionIndex=available.findIndex(q=>q.id===p.questionId);
  const plan=dailyPlan(date,data.questions,data.attempts,data.recalls,due);
  const total=plan.reviewTotal+plan.newTotal;
  const openSetup=(exam=p.exam, mode:typeof setupMode='全部')=>{
    setHideAnalysis(true);setSetupExam(exam);setSetupMode(mode);setSetup(true);patch({tab:'真题练习'});window.scrollTo(0,0);
  };
  const startPractice=()=>{
    const ids=setupMode==='错题'?[...weak]:data.questions.filter(q=>!setupExam||q.exam===setupExam).map(q=>q.id);
    if (!ids.length) return;
    if (setupMode==='混合') for(let i=ids.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[ids[i],ids[j]]=[ids[j],ids[i]]}
    setHideAnalysis(true);
    go(ids[0],{mode:setupMode,exam:setupMode==='错题'?'':setupExam,queue:setupMode==='全部'?[]:ids});
  };
  const startAt=(nextBatch:ReviewBatch)=>{
    const item=nextBatch.items[nextBatch.index];
    setHideAnalysis(true);
    if(item.kind==='question') {
      go(item.item_id,{exam:data.questions.find(q=>q.id===item.item_id)?.exam||'',mode:'全部',queue:[],reviewBatch:nextBatch});
    }else{
      patch({tab:'知识学习',knowledgeId:item.item_id,knowledgeScope:'point',answer:[],confidence:'未选择',submittedId:null,reviewBatch:nextBatch});
      setResult(null);pendingSubmission.current=null;setSearch('');setPhase('recall');
    }
  };
  const startReview=()=>{
    if(reviewItem){setSetup(false);patch({tab:reviewTab(reviewItem)});return}
    const items=due.slice(0,reviewBatchLimit).map(({kind,item_id})=>({kind,item_id}));
    if(items.length)startAt({items,index:0});
  };
  const nextReview=()=>{
    if(!batch||busy||!(reviewingQuestion&&(result||previewed)||reviewingKnowledge&&batch.recalled))return;
    const nextBatch={items:batch.items,index:batch.index+1};
    if(nextBatch.index<batch.items.length){startAt(nextBatch);return}
    setFuture(false);setReviewDate('');patch({tab:'复习中心',reviewBatch:nextBatch});
  };
  const rateRecall=(rating:string)=>run(async()=>{
    await api('/recall',{knowledgeId:p.knowledgeId,rating});
    if(reviewingKnowledge&&batch)patch({reviewBatch:{...batch,recalled:true}});
    await refresh();setMessage('回忆已保存。');
  });
  const startToday=()=>{
    if(reviewItem||due.length){startReview();return}
    const ids=plan.fresh.map(q=>q.id);
    setHideAnalysis(true);
    if(ids.length)go(ids[0],{mode:'混合',queue:ids,exam:''});else openSetup();
  };
  const tabTo=(tab:Progress['tab'])=>{
    if(tab==='真题练习')openSetup();
    else {
      patch({tab,...(tab==='资料纠错'?{reviewBatch:undefined}:{})});
      if(tab==='复习中心'){setFuture(false);setReviewDate('')}
    }
  };
  const paper=currentQuestion.kind==='模拟题'?'2025年上午卷':(p.exam||currentQuestion.exam);
  const paperQuestions=data.questions.filter(q=>q.exam===paper);
  const paperDone=paperQuestions.filter(q=>latest.has(q.id)).length;
  const constitution= data.knowledge.filter(k=>[20001,20002,20003].includes(k.id));
  const recalledConstitution=constitution.filter(k=>data.recalls.some(r=>r.knowledge_id===k.id)).length;
  const openEditor=()=>run(async()=>{setReason('');setEditor(editKind==='question'?await api(`/editor/question/${p.questionId}`):{...knowledge})});
  const backup=async()=>{const b=await api('/backup');download(`慈溪备考-备份-${new Date().toISOString().slice(0,10)}.json`,b);return b};
  const openReview=(review:ReviewItem)=>{
    const items=due.filter(r=>r.kind!==review.kind||r.item_id!==review.item_id).slice(0,reviewBatchLimit-1)
      .map(({kind,item_id})=>({kind,item_id}));
    startAt({items:[review,...items],index:0});
  };
  const navigation=(t:typeof tabs[number],i:number, label:string)=>{
    const Icon=navIcons[i];
    return <button key={t} disabled={busy} aria-current={p.tab===t?'page':undefined} onClick={()=>tabTo(t)}><Icon size={22}/><span>{label}</span></button>;
  };
  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={()=>tabTo('今日学习')}><span>知</span><b>慈溪备考</b></button>
      <nav className="desktop-nav" aria-label="学习导航">
        {tabs.slice(0,5).map((t,i)=>navigation(t,i,tabName(t)))}
        <div className="nav-secondary">{tabs.slice(5).map((t,i)=>navigation(t,i+5,tabName(t)))}</div>
      </nav>
      <div className="side-note"><a href="/signout-with-chatgpt?return_to=/" target="_top">退出登录</a></div>
    </aside>
    <div className="mobile-top">
      <button className="brand" onClick={()=>tabTo('今日学习')}><span>知</span><b>慈溪备考</b></button>
      <details className="mobile-more"><summary>我的 <ChevronDown size={16}/></summary><div>
        {tabs.slice(4).map((tab,i)=>{
          const Icon=navIcons[i+4];
          return <button key={tab} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');tabTo(tab)}}><Icon size={18}/>{tabName(tab)}</button>;
        })}
        <a href="/signout-with-chatgpt?return_to=/" target="_top">退出登录</a>
      </div></details>
    </div>
    <nav className="mobile-tabs" aria-label="学习导航">{tabs.slice(0,4).map((t,i)=>navigation(t,i,mobileLabels[i]))}</nav>
    <main className={p.tab==='今日学习'?'dashboard':undefined}>
      {p.tab!=='今日学习'&&<header className="page-header"><h1>{tabName(p.tab)}</h1></header>}
      {message&&<div className="message" role="status">{message}</div>}
      {syncError&&<div className="notice sync-warning" role="status">{syncError} <button className="text-link" onClick={()=>setP(prev=>({...prev}))}>重试</button></div>}
      {(reviewingQuestion||reviewingKnowledge)&&!setup&&batch&&<div className="review-context">
        <span>到期复习 · {batch.index+1} / {batch.items.length}</span>
        <button className="text-link" disabled={busy} onClick={()=>tabTo('复习中心')}>返回复习中心</button>
      </div>}
      {p.tab==='今日学习'&&<>
        <section className="today">
          <p className="today-date">{new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric'}).format(new Date(date+'T00:00:00+08:00'))} · {new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',weekday:'short'}).format(new Date(date+'T00:00:00+08:00'))}</p>
          <div className="today-heading">
            <div><h1>{total>0?<><span>今天，</span>{total} {plan.includesKnowledge?'项':'题'}</>:'今日任务完成'}</h1>
              <p>复习 {plan.reviewTotal} · 新题 {plan.newTotal}{total>0?' · 约 '+Math.max(1,Math.round(total*0.9))+' 分钟':''}</p></div>
            <button className="primary today-start" onClick={startToday} disabled={busy}>{reviewItem?'继续复习':plan.done>=total?'继续练习':plan.done?'继续':'开始'} <ArrowRight size={22}/></button>
          </div>
          <div className="progress-line"><progress aria-label="今日任务进度" value={plan.done} max={total||1}/><span>{plan.done}/{total}</span></div>
          {daily&&<blockquote>{daily.text} <cite>—— {daily.author}《{daily.source}》</cite></blockquote>}
        </section>
        <section className="metrics" aria-label="学习概况">
          {([
            ['今日到期',due.length,()=>tabTo('复习中心')],
            ['已练题目',first.length,()=>tabTo('学习记录')],
            ['待巩固',weak.length,()=>openSetup('', '错题')],
          ] as const).map(([title,count,open])=>count?
            <button key={title} onClick={open}><span>{title} <ArrowRight size={19}/></span><strong>{count}</strong></button>:
            <div className="metric-zero" key={title}><span>{title}</span><strong>0</strong></div>)}
        </section>
        <section className="continue">
          <div className="continue-heading"><h2>按考点继续</h2><details className="metric-help">
            <summary aria-label="查看统计口径"><Info size={19}/></summary>
            <p>已练题目按题计数。争议题只供对照，统计时会扣除。待巩固包含上次答错、犹豫或猜对的题。</p>
          </details></div>
          <button className="continue-row" onClick={()=>chooseK(20002)}><b>宪法与立法权限</b><span>{constitution.length} 张知识卡 · 已回忆 {recalledConstitution} 张</span><progress aria-label="宪法知识卡回忆进度" value={recalledConstitution} max={constitution.length||1}/><ArrowRight size={22}/></button>
          <button className="continue-row" onClick={()=>{setHideAnalysis(true);if(currentQuestion.exam===paper&&(!p.submittedId||result?.id===p.submittedId)&&p.mode==='全部'){patch({tab:'真题练习'});setSetup(false)}else openSetup(paper)}}><b>{paperName(paper)}</b><span>已做 {paperDone} / {paperQuestions.length}</span><progress aria-label="试卷完成进度" value={paperDone} max={paperQuestions.length||1}/><ArrowRight size={22}/></button>
          <button className="continue-row" disabled={!mockQuestions.length} onClick={()=>openSetup(mockQuestions[0].exam)}><b>分类模拟题</b><span>{mockQuestions.length} 题 · 已做 {mockQuestions.filter(q=>latest.has(q.id)).length}</span><progress aria-label="模拟题完成进度" value={mockQuestions.filter(q=>latest.has(q.id)).length} max={mockQuestions.length||1}/><ArrowRight size={22}/></button>
        </section>
        <section className="review-forecast" aria-label="未来七天已安排的复习">
          <h2>未来 7 天复习量</h2>
          <div className="review-bars">{reviewDays.map(({day,count})=><button key={day} disabled={!count} aria-label={reviewDateLabel(day,date)+' '+count+' 项复习'} onClick={()=>{setFuture(true);setReviewDate(day);patch({tab:'复习中心'});}}>
            <span>{count}</span><span className="review-bar" aria-hidden="true"><i style={{height:100*count/reviewPeak+'%'}}/></span><span>{reviewDateLabel(day,date)}</span>
          </button>)}</div>
        </section>
      </>}
  {p.tab==='知识学习'&&<>{!reviewingKnowledge&&<section className="panel">
    <div className="filters">
      <div className="field"><label htmlFor="knowledge-category">大类</label>
        <Select value={knowledge.category} onValueChange={category=>{const item=data.knowledge.find(k=>k.category===category);if(item)chooseK(item.id,false,'category')}}>
          <SelectTrigger id="knowledge-category"><SelectValue/></SelectTrigger>
          <SelectContent position="popper" align="start">{categories.map(category=><SelectItem key={category} value={category}>{categoryName(category)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="field"><label htmlFor="knowledge-point">知识点</label>
        <Select value={learningCategory?'category':visibleKnowledge.some(k=>k.id===p.knowledgeId)?String(p.knowledgeId):''} onValueChange={value=>value==='category'?chooseK(categoryKnowledge[0].id,false,'category'):chooseK(Number(value))}>
          <SelectTrigger id="knowledge-point"><SelectValue placeholder={visibleKnowledge.length?'选择知识点':'没有匹配的知识点'}/></SelectTrigger>
          <SelectContent position="popper" align="start"><SelectItem value="category">整个大类（按顺序学习）</SelectItem>{visibleKnowledge.map(k=><SelectItem key={k.id} value={String(k.id)}>{k.title}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
    <label className="field">在当前大类中查找<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="输入知识点标题或关键词"/></label>
    <p className="source">{search.trim()?<>找到 {visibleKnowledge.length} 个知识点，共 {categoryKnowledge.length} 个</>:<>共 {categoryKnowledge.length} 个知识点</>}</p>
  </section>}
  <section className="panel" id="knowledge-content"><span className="eyebrow">{categoryName(knowledge.category)} · {learningCategory?`当前第${categoryIndex+1}/${categoryKnowledge.length}个知识点 · `:''}{knowledge.status}</span><h2>{knowledge.title}</h2>{phase==='read'?<><div className="knowledge"><div className="question">{knowledge.content}</div></div><button className="primary" onClick={()=>setPhase('recall')}>读完了，自测一下</button></>:<><div className="recall-prompt"><h3>离开原文，试着回答</h3><p>{knowledge.question}</p></div>{phase==='check'?<div className="answer question">{knowledge.content}</div>:<p className="muted">核心内容已隐藏。口头回忆后再展开核对。</p>}<button onClick={()=>setPhase(phase==='check'?'recall':'check')}>{phase==='check'?'再次隐藏要点':'展开要点核对'}</button><div className="buttons">{['记住了','记住一部分','还没记住'].map(r=><button key={r} disabled={phase!=='check'||busy||(reviewingKnowledge&&batch?.recalled)} onClick={()=>rateRecall(r)}>{r}</button>)}</div></>}
  {phase!=='recall'&&<p className="source">出处：{knowledge.source}　{knowledge.module!=='模拟题补充知识'&&<a href={pdf(knowledge.material,knowledge.page)} target="_blank" rel="noreferrer">查看原页</a>}</p>}{learningCategory&&!reviewingKnowledge&&<div className="buttons" aria-label="大类学习进度"><button disabled={categoryIndex===0} onClick={()=>chooseK(categoryKnowledge[categoryIndex-1].id,false,'category')}>上一个知识点</button><button className="primary" disabled={categoryIndex===categoryKnowledge.length-1} onClick={()=>chooseK(categoryKnowledge[categoryIndex+1].id,false,'category')}>{categoryIndex===categoryKnowledge.length-1?'已到本大类最后一个知识点':'下一个知识点 →'}</button></div>}{reviewingKnowledge?<div className="practice-actions"><button className="primary" disabled={busy||!batch?.recalled} onClick={nextReview}>下一项复习 <ArrowRight size={18}/></button></div>:<><div className="divider"/><h3>学后练习</h3>{related.length?<><p className="muted">仅使用已确认关联；进入时重新隐藏答案。</p><div className="link-list">{related.map(q=><button className="study-row" key={q.id} onClick={()=>go(q.id,{mode:'学后',queue:related.map(x=>x.id)})}><span>{label(q.id)}</span><ArrowRight size={18}/></button>)}</div><button className="primary" onClick={startLinked}>练当前知识的题目 →</button></>:<p className="notice">题库暂未覆盖当前知识的已确认关联。先完成回忆，或到“资料纠错”核对并补充关联。</p>}</>}</section></>}
  {p.tab==='真题练习'&&(setup||questionIndex<0?<section className="panel practice-setup">
    <h2>选择练习</h2>
    <div className="segmented" role="group" aria-label="练习模式">
      {practiceModes.map(([mode,name])=><button key={mode} aria-pressed={setupMode===mode} onClick={()=>setSetupMode(mode)}>{name}</button>)}
    </div>
    {setupMode==='错题'?<p className="muted">{weak.length?'共有 '+weak.length+' 道待巩固题。':'目前没有待巩固的题。'}</p>:
      <div className="practice-sources">
        <button className="source-choice" aria-pressed={setupExam===''} onClick={()=>setSetupExam('')}><span>全部来源</span><small>{sourceInfo('')}</small></button>
        <h3>真题</h3>
        <div className="papers" role="group" aria-label="历年真题">
          {papers.map(exam=><button key={exam} className="source-choice" aria-pressed={setupExam===exam} onClick={()=>setSetupExam(exam)}><span>{paperName(exam)}</span><small>{sourceInfo(exam)}</small></button>)}
        </div>
        <h3>模拟题</h3>
        <div className="papers" role="group" aria-label="模拟题考点">
          {mockSources.map(exam=><button key={exam} className="source-choice" aria-pressed={setupExam===exam} onClick={()=>setSetupExam(exam)}><span>{exam.replace(/^模拟题 · /,'')}</span><small>{sourceInfo(exam)}</small></button>)}
        </div>
      </div>}
    <div className="buttons">
      <button className="primary" disabled={setupMode==='错题'&&!weak.length} onClick={startPractice}>开始练习 <ArrowRight size={18}/></button>
      {questionIndex>=0&&<button className="text-link" onClick={()=>setSetup(false)}>继续上次作答</button>}
    </div>
  </section>:<>
    {!reviewingQuestion&&<section className="practice-toolbar" aria-label="题目位置">
      <div className="practice-topline">
        <div><p>{p.mode==='学后'?'学后练习':p.mode==='错题'?'错题与犹豫题':p.mode==='混合'?'混合练习':(p.exam?paperName(p.exam):'全部来源')}</p><strong>{questionIndex+1} <span>/ {available.length}</span></strong></div>
        <div className="practice-tools">
          <button aria-expanded={showGrid} aria-controls="question-grid" onClick={()=>setShowGrid(s=>!s)}>题号 <ChevronDown size={16}/></button>
          {p.mode!=='全部'&&<button className="text-link" onClick={()=>openSetup(p.exam,p.mode==='学后'?'全部':p.mode)}>换一组</button>}
          {p.mode==='学后'&&<button className="text-link" onClick={()=>chooseK(p.knowledgeId)}>返回知识</button>}
        </div>
      </div>
      <p className="source keyboard-hint">A–D / 1–4 选项 · 聚焦提交按钮后按 Enter · → 提交后前进</p>
      {showGrid&&<div id="question-grid" className="question-grid" aria-label="题号">
        {available.map((q,i)=><button key={q.id} title={label(q.id)} aria-label={'第'+(i+1)+'项 · '+label(q.id)} aria-current={q.id===p.questionId?'step':undefined} className={latest.has(q.id)?'answered':''} disabled={busy} onClick={()=>q.id===p.questionId?setShowGrid(false):go(q.id)}>{p.mode==='全部'&&p.exam?q.number:i+1}</button>)}
      </div>}
    </section>}
    <section className="panel practice-panel" aria-label="当前题目">
      <div className="practice-meta">
        <div className="qmeta"><span className="badge">{question.type}</span><span className={'badge '+(question.status==='争议'?'disputed':'')}>{question.status}</span></div>
        {!reviewingQuestion&&<label className="analysis-switch" htmlFor="analysis-switch">作答前隐藏解析 <Switch id="analysis-switch" className="preview-switch" checked={hideAnalysis} disabled={busy||!!result} onCheckedChange={setHideAnalysis}/></label>}
      </div>
      {question.status==='争议'&&<p className="notice">本题答案存在争议，仅供资料对照。</p>}
      <div className="question">{options?.stem??(question.type==='判断'?formatQuestionText(question.body,question.number):question.body)}</div>
      {question.image&&<img className="source-image" src={question.image} alt="题目配图"/>}
      <p className="source"><a href={pdf(question.question_material,question.source_page)} target="_blank" rel="noreferrer">{question.kind==='模拟题'?'参考真题':'原试卷'}第{question.source_page}页</a></p>
      <div className={'practice-answers '+(options?'practice-option-list':'practice-compact')} role="group" aria-label={question.type==='多选'?'答案，可多选':'答案'}>
        {(question.type==='判断'?(['A','D'] as const):optionLetters).map((letter,index)=>{
          const selected=p.answer.includes(letter);
          const isCorrect=!!result&&!result.disputed&&result.answer.includes(letter);
          const isWrong=!!result&&!result.disputed&&selected&&!isCorrect;
          const text=options?.choices[index]??(question.type==='判断'?(letter==='A'?'正确':'错误'):'');
          return <button key={letter} aria-pressed={selected} aria-keyshortcuts={letter+' '+(optionLetters.indexOf(letter)+1)} disabled={!!result||busy||!hideAnalysis||previewed}
            className={isCorrect?'option-correct':isWrong?'option-wrong':selected?'selected':''}
            onClick={()=>selectAnswer(letter,question.type)}>
            <span className="practice-option-letter">{letter}</span>{text&&<span>{text}</span>}
            {isCorrect&&<Check size={18} aria-label="正确选项"/>}{isWrong&&<X size={18} aria-label="你选错的选项"/>}
          </button>;
        })}
      </div>
      {question.type==='多选'&&!result&&hideAnalysis&&<p className="source">可选择多个选项。</p>}
      {hideAnalysis&&previewed&&!result&&<p className="notice">本次已查看解析，可以前往下一题。</p>}
      {!hideAnalysis&&!result&&<div className="result" aria-live="polite">
        <p className="source">查看解析期间无法提交作答。</p>
        {preview?.id===question.id?<><h3>{question.status==='争议'?'资料参考答案':'正确答案'} {preview.answer}</h3><p className="direct">{formatQuestionAnalysis(preview.direct)}</p></>:<p>正在读取解析…</p>}
      </div>}
      {result&&<div className={'result practice-result '+(result.disputed?'disputed':'')}>
        <div role="status">
          <h3>{result.disputed?'资料参考答案':'正确答案'} {result.answer}{question.type==='判断'?(result.answer==='A'?'（正确）':'（错误）'):''}</h3>
          <p className="muted">{result.disputed?'争议题 · ':''}你选了 {p.answer.join('')} · {p.confidence}</p>
        </div>
        {(!memoryTip||memoryTip[1].trim())&&<p className="direct">{formatQuestionAnalysis(memoryTip?.[1].trim()??result.direct)}</p>}
        {memoryTip&&<p className="remember"><b>记住</b> {formatQuestionAnalysis(memoryTip[2])}</p>}
        {nextScheduled&&<p className="review-confirmation"><CalendarDays size={16}/> {nextScheduled>date?'下次复习 · '+reviewDateLabel(nextScheduled,date):'本题仍在到期复习中'}</p>}
        {result.note&&<p className="notice">{result.note}</p>}
        <details><summary>{question.kind==='模拟题'?'完整解析':'原资料解析'}</summary><div className="question">{formatQuestionAnalysis(result.analysis)}</div></details>
        <details><summary>出处与核对信息</summary>
          <p className="source"><a href={pdf(result.analysis_material,result.analysis_page)} target="_blank" rel="noreferrer">{question.kind==='模拟题'?'参考真题解析':'解析原文'}第{result.analysis_page}页</a> · 解析来源 {result.explanation_source} · 版本 {result.version}</p>
          {result.references?.map(r=><p className="source" key={r.url}><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a></p>)}
        </details>
        {(!result.correct||p.confidence!=='确定')&&!result.disputed&&<div className="reasons" role="group" aria-label="错因">
          <h4>这次卡在哪里</h4>
          <div className="buttons">{mistakeReasons.map(reason=>{
            const selected=data.attempts.find(a=>a.id===result.id)?.error_reason===reason;
            return <button key={reason} className={selected?'selected':''} aria-pressed={selected} disabled={busy} onClick={()=>run(async()=>{await api('/reason',{id:result.id,reason});await refresh();setMessage('原因已记录。')})}>{reason}</button>;
          })}</div>
        </div>}
        {data.links.some(l=>l.question_id===p.questionId&&l.status==='已确认')&&<div><h4>回去补这个考点</h4><div className="buttons">{data.links.filter(l=>l.question_id===p.questionId&&l.status==='已确认').map(l=><button className="text-link" key={l.knowledge_id} onClick={()=>chooseK(l.knowledge_id)}>{data.knowledge.find(k=>k.id===l.knowledge_id)?.title} <ArrowRight size={16}/></button>)}</div></div>}
        {!reviewingQuestion&&<div className="buttons"><button className="text-link" onClick={()=>go(p.questionId)}>重新独立作答</button><button className="text-link" onClick={()=>{patch({tab:'资料纠错'});setEditKind('question');setEditor(null)}}>解析有疑问</button></div>}
      </div>}
      <div className="practice-actions" role="group" aria-label="答题操作">
        {!reviewingQuestion&&<button className="text-link" disabled={busy||questionIndex===0} onClick={()=>move(-1)}><ArrowLeft size={18}/> 上一题</button>}
        {!reviewingQuestion&&hideAnalysis&&!previewed&&!result&&questionIndex+1<available.length&&<button className="text-link skip" disabled={busy} onClick={()=>move(1)}>跳过</button>}
        {hideAnalysis&&!previewed&&!result?
          <div className="practice-submitters" role="group" aria-label="选择把握程度并提交">
            {confidenceLevels.map(level=><button key={level} className="primary" disabled={busy||!p.answer.length} onClick={()=>submit(level)}>
              {busy&&p.confidence===level?'正在提交…':level+' · 提交'}
            </button>)}
          </div>:
          <button className="primary" aria-keyshortcuts={result?'ArrowRight':undefined} disabled={busy} onClick={reviewingQuestion?nextReview:questionIndex+1<available.length?()=>move(1):()=>tabTo('今日学习')}>
            {reviewingQuestion?(previewed&&!result?'跳过本项':'下一项复习'):questionIndex+1<available.length?'下一题':'回到今日'} <ArrowRight size={18}/>
          </button>}
      </div>
    </section>
  </>)}
  {p.tab==='复习中心'&&<section className="panel">
    <div className="continue-heading"><h2>复习安排</h2><details className="metric-help"><summary aria-label="复习安排说明"><Info size={19}/></summary><p>系统按作答和回忆结果安排复习。同一天重复答对不会延后下次复习。</p></details></div>
    {batch&&!reviewItem&&<div className="message" role="status">本批复习已结束，剩余 {due.length} 项到期任务。</div>}
    <div className="segmented" role="group" aria-label="复习范围">
      <button aria-pressed={!future} onClick={()=>{setFuture(false);setReviewDate('')}}>今天到期</button>
      <button aria-pressed={future} onClick={()=>{setFuture(true);setReviewDate('')}}>全部安排</button>
    </div>
    {(reviewItem||due.length>0)&&<div className="buttons"><button className="primary" disabled={busy} onClick={startReview}>{reviewItem?'继续本批复习':batch?'开始下一批':'开始今日复习'}</button></div>}
    {reviewDate&&<button className="text-link" onClick={()=>setReviewDate('')}>查看所有日期</button>}
    {[...reviewGroups].map(([day,items])=><section className="review-day" key={day}>
      <h3>{reviewDateLabel(day,date)}{day<date?' · 已到期':''} <small>{items.length} 项</small></h3>
      {items.map(r=><div className="row" key={r.kind+r.item_id}>
        <span>{r.kind==='question'?label(r.item_id):data.knowledge.find(k=>k.id===r.item_id)?.title}</span>
        {day>date?<span className="source">未到期</span>:!reviewItem&&<button className="text-link" disabled={busy} onClick={()=>openReview(r)}>从这里复习 <ArrowRight size={16}/></button>}
      </div>)}
    </section>)}
    {reviewGroups.size===0&&<p className="empty">{future?'这段时间没有复习安排。':'今天没有到期任务。'}</p>}
  </section>}
  {p.tab==='学习记录'&&<><section className="panel"><h2>学习记录</h2><p>累计{data.attempts.length}次作答；非争议题首次{first.length}次、重复{valid.length-first.length}次；争议题{data.attempts.filter(a=>a.disputed).length}次单独记录。</p><p className="source">首次表现与重复表现分别记录。看过解析后的重答不能单独证明已经掌握；跨日回忆和换题证据仍需积累。</p><h3>常见错因</h3>{storedMistakeReasons.map(r=>{const n=data.attempts.filter(a=>a.error_reason===r).length;return n?<p key={r}>{r}：{n}次</p>:null})}<details><summary>最近作答记录</summary>{data.attempts.slice(0,50).map(a=><div className="row" key={a.id}><div><b>{label(a.question_id)}</b><p>{a.kind} · 答案{a.answer} · {a.confidence} · {a.disputed?'争议，未计掌握':a.correct?'与参考一致':'需巩固'} · {a.error_reason}</p></div><button onClick={()=>go(a.question_id,{mode:'全部',queue:[],exam:data.questions.find(q=>q.id===a.question_id)?.exam||''})}>复练</button></div>)}</details></section>
  <section className="panel"><h2>备份与恢复</h2><p className="muted">备份包含题库文本、解析、知识、关联、学习记录、草稿和修改历史。PDF保留在原资料中，不包含在下载的JSON里。</p><button onClick={()=>run(async()=>{await backup();setMessage('备份已生成，请保留下载文件。')})}>下载完整学习备份</button><label className="field">从备份恢复<input type="file" accept=".json,application/json" onChange={e=>run(async()=>{const file=e.target.files?.[0];if(!file)return;if(file.size>8_000_000)throw new Error('备份大于8MB，请联系维护者处理。');const value=JSON.parse(await file.text());if(value.format!=='cixi-study-v1')throw new Error('这不是慈溪备考备份。');setPending(value)})}/></label>{pending&&<div className="notice"><p>将恢复{pending.exported_at}的备份，覆盖当前账号学习记录和纠错内容。恢复前会先下载当前数据备份。</p><div className="buttons"><button disabled={busy} onClick={()=>run(async()=>{await backup();await api('/restore',pending);setPending(null);setResult(null);const b=await refresh();setP(b.progress||initial);setMessage('恢复完成。')})}>确认恢复这份备份</button><button onClick={()=>setPending(null)}>取消</button></div></div>}</section></>}
  {p.tab==='资料纠错'&&<><section className="panel"><h2>核对与修订内容</h2><p className="muted">打开题目修订会显示参考答案。修订仅作用于你的学习空间；旧作答保留当时依据。</p><label className="field">内容类型<select value={editKind} onChange={e=>{setEditKind(e.target.value as any);setEditor(null)}}><option value="question">题目与解析</option><option value="knowledge">知识卡片</option></select></label>{editKind==='question'?<label className="field">题目<select value={p.questionId} onChange={e=>{patch({questionId:Number(e.target.value),answer:[],submittedId:null,mode:'全部',queue:[],exam:data.questions.find(q=>q.id===Number(e.target.value))?.exam||''});setResult(null);setEditor(null)}}>{data.questions.map(q=><option key={q.id} value={q.id}>{label(q.id)}</option>)}</select></label>:<label className="field">知识<select value={p.knowledgeId} onChange={e=>{patch({knowledgeId:Number(e.target.value)});setEditor(null)}}>{data.knowledge.map(k=><option key={k.id} value={k.id}>{k.title}</option>)}</select></label>}<button disabled={busy} onClick={openEditor}>打开待核对内容</button>
  {editor&&<div className="editor"><p className="source">当前版本{editor.version}</p>{(editKind==='question'?[['题干与选项','body'],['简要解析','direct'],['完整解析','analysis'],['争议说明','note']]:[['标题','title'],['核心要点','content'],['回忆问题','question'],['出处','source']]).map(([label,key])=><label className="field" key={key}>{label}<textarea rows={key==='body'||key==='analysis'||key==='content'?7:3} value={editor[key]||''} onChange={e=>setEditor({...editor,[key]:e.target.value})}/></label>)}{editKind==='question'&&<div className="filters"><label className="field">题型<select value={editor.type} onChange={e=>setEditor({...editor,type:e.target.value})}>{['单选','多选','判断'].map(t=><option key={t}>{t}</option>)}</select></label><label className="field">参考答案<input value={editor.answer} maxLength={4} onChange={e=>setEditor({...editor,answer:e.target.value.toUpperCase()})}/></label></div>}<label className="field">核对状态<select value={editor.status} onChange={e=>setEditor({...editor,status:e.target.value})}>{['待核对','已核对','争议'].map(t=><option key={t}>{t}</option>)}</select></label><div className="filters">{(editKind==='question'?[['试题页码','source_page'],['解析页码','analysis_page']]:[['原文页码','page']]).map(([label,key])=><label className="field" key={key}>{label}<input type="number" min={1} max={500} value={editor[key]} onChange={e=>setEditor({...editor,[key]:Number(e.target.value)})}/></label>)}</div><label className="field">修改理由<input value={reason} maxLength={400} onChange={e=>setReason(e.target.value)} placeholder="注明核对依据与改动原因"/></label><button className="primary" disabled={busy||!reason.trim()} onClick={()=>run(async()=>{await api('/edit',{kind:editKind,itemId:editor.id,version:editor.version,payload:editor,reason});setEditor(null);setResult(null);patch({submittedId:null,answer:[]});await refresh();setMessage('修订已保存；历史作答依据保持完整。')})}>保存修订与版本记录</button></div>}</section>
  <section className="panel"><h2>知识与题目关联</h2><label className="field">知识<select value={p.knowledgeId} onChange={e=>patch({knowledgeId:Number(e.target.value)})}>{data.knowledge.map(k=><option key={k.id} value={k.id}>{k.title}</option>)}</select></label>{data.links.filter(l=>l.knowledge_id===p.knowledgeId).map(l=><div className="row" key={l.question_id}><div><b>{label(l.question_id)} · {l.status}</b><p>{l.reason}</p></div><button disabled={busy} onClick={()=>run(async()=>{await api('/link',{knowledgeId:p.knowledgeId,questionId:l.question_id,status:l.status==='已确认'?'已排除':'已确认',reason:l.reason});await refresh()})}>{l.status==='已确认'?'排除关联':'确认关联'}</button></div>)}<label className="field">补充关联题<select value={linkQ} onChange={e=>setLinkQ(Number(e.target.value))}>{data.questions.map(q=><option key={q.id} value={q.id}>{label(q.id)}</option>)}</select></label><label className="field">关联依据<input value={linkReason} onChange={e=>setLinkReason(e.target.value)} maxLength={400} placeholder="核对题目、原解析和当前知识后填写"/></label><button disabled={busy||!linkReason.trim()} onClick={()=>run(async()=>{await api('/link',{knowledgeId:p.knowledgeId,questionId:linkQ,status:'已确认',reason:linkReason});await refresh();setLinkReason('');setMessage('已确认的关联可以直接用于学后练习。')})}>确认并保存关联</button><p className="source">第一版采用核对后的关联，不自动发布文字相似的候选。</p></section><section className="panel"><button onClick={()=>run(async()=>setHistory(await api('/history')))}>查看内容修订记录</button>{history.map((h,i)=><p className="source" key={i}>{h.created_at} · {h.kind==='question'?label(h.item_id):data.knowledge.find(k=>k.id===h.item_id)?.title} · 从版本{h.revision}修订 · {h.reason}</p>)}</section></>}
  {p.tab==='原始资料'&&<section className="panel"><h2>原始资料</h2><label className="field">选择资料<select value={material} onChange={e=>setMaterial(Number(e.target.value))}>{data.materials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><p><a href={data.materials.find(m=>m.id===material)?.url} target="_blank" rel="noreferrer">打开或下载原始PDF</a></p><iframe className="pdf" title="原始资料PDF" src={data.materials.find(m=>m.id===material)?.url}/></section>}
  </main></div>;
}
