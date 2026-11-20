import {expandKeys, type QuestionBreakdown} from './breakdown.ts';

function comparisonText(text:string) {
  return text.normalize('NFC')
    .replace(/[！-～]/g,char=>String.fromCharCode(char.charCodeAt(0)-0xfee0))
    .replace(/。/g,'.')
    .replace(/\s+/gu,'')
    .replace(/\.$/,'');
}

export function explanationParts(direct:string, analysis:string) {
  const memory=direct.match(/^([\s\S]*?)记住[：:]\s*([\s\S]+)$/);
  const summary=(memory?.[1]??direct).trim();
  const takeaway=memory?.[2].trim()??'';
  const full=analysis.trim();
  const fullText=comparisonText(full);
  if(!fullText||comparisonText(direct)===fullText||(!summary&&!takeaway)){
    return {summary:summary||(!takeaway?full:''),takeaway,full:'',isExcerpt:false};
  }
  const summaryText=comparisonText(summary);
  if(summaryText===fullText)return {summary,takeaway,full:'',isExcerpt:false};

  // Imported summaries may join several original sentences in the same order.
  const parts=summary.split(/(?<=[。！？!?])/u).map(comparisonText).filter(Boolean);
  let end=0;
  const isExcerpt=!!summaryText&&(fullText.includes(summaryText)||(parts.length>1&&parts.every(part=>{
    const start=fullText.indexOf(part,end);
    if(start<0)return false;
    end=start+part.length;
    return true;
  })));
  return {summary,takeaway,full,isExcerpt};
}

const answerLine=/(?:^|\n)[ \t]*(?:\d+[、.．][ \t]*)?(?:【(?:参考答案|答案)】[ \t]*[：:]?|(?:参考答案|答案)[：:])[ \t]*(?:[A-DＡ-Ｄ]+|正确|错误|[√×✓✔✗✘])(?:[ \t]*[（(]争议题[）)])?[ \t]*(?:[。.．]|(?=\n|$|【解析】|解析[：:]))/u;
const quickTip=/(?:^|\n)[ \t]*(?:【快速解题思路】|快速解题思路[：:])[ \t]*([\s\S]*?)(?=\n[ \t]*(?:【[^】\n]+】|(?:拓展|知识拓展|易错提醒|参考资料)[：:])|$)/u;

export function practiceExplanation(direct:string, analysis:string, answer:string, chosen:string, breakdown?:QuestionBreakdown|null) {
  const parts=explanationParts(direct,analysis);
  const source=analysis.replace(/\r\n?/g,'\n');
  const tip=source.match(quickTip);
  const thinking=tip?.[1].trim()||parts.takeaway;
  const withNoTip=source.replace(quickTip,'');
  const answerHeading=withNoTip.match(answerLine);
  const original=(answerHeading
    ?withNoTip.slice(answerHeading.index!+answerHeading[0].length)
    :withNoTip).trim().replace(/^(?:【解析】|解析[：:])\s*/u,'');
  const isWrong=!!chosen&&[...chosen].sort().join('')!==[...answer].sort().join('');
  const focus:{label:string;text:string}[]=[];
  const items=breakdown?.items??[];
  let summary=breakdown?.count_options
    ?parts.summary.replace(/^(?:共有|符合设问的有)\s*\d+\s*项(?:正确)?[，,]\s*选\s*[A-D]。\s*(?=\S)/u,'')
    :parts.summary;
  let extra=items.map(item=>({key:item.key,text:item.basis}));
  if(breakdown&&breakdown.status!=='争议'&&isWrong){
    if(breakdown.count_options){
      const correct=breakdown.count_options[answer], count=breakdown.count_options[chosen];
      const included=items.filter(item=>item.matches_stem===true).map(item=>item.key).join('、');
      if(correct!==undefined&&count!==undefined&&correct!==count){
        const difference=count<correct?'少算':'多算';
        focus.push({label:'错因对照',text:`${difference} ${Math.abs(count-correct)} 项。${included?`计入的陈述是 ${included}。`:'各项均不计入。'}`});
      }
    }else if(breakdown.type!=='判断'){
      const selected=expandKeys(breakdown,chosen), expected=expandKeys(breakdown,answer);
      const wrong=items.filter(item=>selected.includes(item.key)&&!expected.includes(item.key));
      const missed=breakdown.type==='多选'||breakdown.combination_map
        ?items.filter(item=>expected.includes(item.key)&&!selected.includes(item.key)):[];
      focus.push(...wrong.map(item=>({label:'为什么不选 '+item.key,text:item.basis})),
        ...missed.map(item=>({label:'漏选 '+item.key,text:item.basis})));
      extra=extra.filter(item=>!wrong.some(w=>w.key===item.key)&&!missed.some(m=>m.key===item.key));
    }
  }
  // Simulations already put their A–D explanations in one paragraph.
  const optionNotes=[...summary.matchAll(/(?:^|(?<=[。！？\n]))\s*([A-D])项[：:]/gu)];
  if(!breakdown&&optionNotes.map(note=>note[1]).join('')==='ABCD'){
    const options=optionNotes.map((note,index)=>({
      key:note[1], text:summary.slice(note.index+note[0].length,optionNotes[index+1]?.index).trim(),
    }));
    summary=summary.slice(0,optionNotes[0].index).trim().replace(/^考点[：:]\s*/u,'').replace(/本题选[A-D]+[。.]?$/u,'');
    const keyPoints=options.filter(option=>answer.includes(option.key));
    summary=[summary,...keyPoints.map(option=>option.text)].filter(Boolean).join('');
    const wrong=options.filter(option=>isWrong&&chosen.includes(option.key)&&!answer.includes(option.key));
    const missed=options.filter(option=>isWrong&&answer.length>1&&answer.includes(option.key)&&!chosen.includes(option.key));
    focus.push(...wrong.map(option=>({label:'为什么不选 '+option.key,text:option.text})),
      ...missed.map(option=>({label:'漏选 '+option.key,text:option.text})));
    extra=options.filter(option=>!keyPoints.includes(option)&&!wrong.includes(option)&&!missed.includes(option));
  }
  summary=summary.replace(/([，,；;]|^)[ \t]*(?:因此[，,]?|故)?[ \t]*(?:应选|选择|选|对应)[ \t]*([A-D]+)[。.]?$/u,
    (text,separator,letters)=>letters===answer?(separator?'。':''):text);
  const summaryText=comparisonText(summary);
  const thinkingText=comparisonText(thinking);
  const seen=new Set([summaryText]);
  const uniqueFocus=focus.filter(item=>{
    const text=comparisonText(item.text);
    if(!text||seen.has(text)||summaryText.includes(text))return false;
    seen.add(text);
    return true;
  });
  return {
    summary,
    focus:uniqueFocus,
    thinking:thinkingText&&!summaryText.includes(thinkingText)&&!seen.has(thinkingText)?thinking:'',
    extra:extra.filter(item=>!seen.has(comparisonText(item.text))),
    full:parts.full&&comparisonText(original)!==summaryText?original:'',
  };
}
