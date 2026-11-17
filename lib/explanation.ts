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
