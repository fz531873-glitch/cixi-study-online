export const optionLetters = ['A', 'B', 'C', 'D'] as const;
const circled = '①②③④⑤⑥⑦⑧⑨';
const optionMarker = /(^|\s)([A-Z])[.．、][ \t]*/g;
const statementMarker = /^[ \t]*(?:([1-9])(?:[.．、)）][ \t]*|[ \t]*(?=[\p{Script=Han}“]))|([①-⑨])[ \t]*)/gmu;

function cleanQuestionText(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/(\p{Script=Han})[ \t]+(?=\d)/gu, '$1')
    .replace(/(\d)[ \t]+(?=[年月日时点分秒岁万亿元人公里项题条章届次个份])/gu, '$1')
    .replace(/(\d(?:年|月|日))[ \t]+(?=\d)/g, '$1');
}

function joinLines(text: string) {
  return text.split(/\n\s*\n/).map(block => {
    const lines = block.split('\n').map(line => line.trim());
    return lines.reduce((paragraph, line) => {
      const space = /[a-z\d]$/i.test(paragraph) && /^[a-z\d]/i.test(line) ? ' ' : '';
      return paragraph + space + line;
    }, '');
  }).join('\n\n');
}

function punctuation(text: string) {
  return text
    .replace(/([,;:?!])(?=\s*[\p{Script=Han}《“①-⑨])|(?<=[\p{Script=Han}》”])([,;:?!])(?![a-z\d])/giu,
      mark => ({',':'，',';':'；',':':'：','?':'？','!':'！'})[mark]!)
    .replace(/\([ \t]*\)/g, '（　）')
    .replace(/\(([\p{Script=Han}，、]+)\)/gu, '（$1）');
}

export function formatQuestionText(body: string, number?: number) {
  const text = number === undefined ? body : body.replace(new RegExp('^\\s*'+number+'[、.．]\\s*'), '');
  return punctuation(cleanQuestionText(joinLines(text.replace(/\r\n?/g, '\n'))));
}

export function formatQuestionAnalysis(text: string) {
  const numbered = text.replace(/\r\n?/g, '\n').replace(/([1-9])(?:[.、])?(?=(?:选项)?(?:正确|错误))/g,
    (match, digit, offset, input) => /\d/.test(input[offset - 1] ?? '') ? match : circled[Number(digit) - 1]);
  const paragraphs = numbered.replace(/\n[ \t]*(?=【|第[一二三四五六七八九十\d]+步[：:，,]|[A-D][ \t]*(?:项|[.．、：:]|正确|错误)|[①-⑨]|[（(][一二三四五六七八九十\d]+[）)]|(?:拓展|快速解题思路)[：:])/gu, '\n\n');
  return punctuation(cleanQuestionText(joinLines(paragraphs)));
}

export function questionSummary(body:string, type:string, number:number) {
  const source=body.split(/(?:[【\[](?:答案|解析)[】\]]|(?:参考答案|正确答案|答案解析|答案|解析)[：:])/u,1)[0];
  const parsed=type==='判断'?null:splitQuestionOptions(source,number);
  const optionStart=source.search(/(?:^|\s)[A-DＡ-Ｄ]\s*[.．、:：)）]/u);
  if(!parsed&&optionStart<0&&type!=='判断')return '';
  const stem=parsed?.stem??formatQuestionText(optionStart<0?source:source.slice(0,optionStart),number);
  const chars=[...stem.replace(/\r?\n\s*/g,' ').trim()];
  return chars.length>40?chars.slice(0,40).join('')+'…':chars.join('');
}

export function splitQuestionOptions(body: string, number?: number) {
  const text = body.trim().replace(/\r\n?/g, '\n');
  const first = text.search(/^[ \t]*A[.．、][ \t]*/m);
  if (first <= 0) return null;
  const rest = text.slice(first);
  const markers = [...rest.matchAll(optionMarker)];
  if (markers.map(marker => marker[2]).join('') !== 'ABCD') return null;
  const choices = markers.map((marker, i) => rest.slice(marker.index + marker[0].length, markers[i+1]?.index).trim());
  // shortcut: an ambiguous ending stays in the source layout until the question is corrected.
  if (choices.some(choice => !choice || /\n\s*(?:补充材料|【[^】]+】|参考答案)/.test(choice))) return null;
  const stemText = text.slice(0, first).trimEnd()
    .replace(/([（(][ \t]*[）)])[ \t]*(?=[1①](?:[\p{Script=Han}“、.)）]|$))/gu, '$1\n');
  const markersInStem = [...stemText.matchAll(statementMarker)].filter(marker => marker.index>0);
  const start = markersInStem.findIndex(marker => marker[1]==='1'||marker[2]==='①');
  const statements = start>=0?markersInStem.slice(start):[];
  const combination = (value: string) => value.replace(/[\s、，,]/g, '');
  const countChoices = statements.length > 0 && /[（(]\s*[）)]\s*[个项条种]|几[个项条种]\s*[?？]?\s*[（(]\s*[）)]/u.test(stemText.slice(0, statements[0].index))
    && choices.every(choice => /^\d+$/.test(choice));
  const grouped = statements.length >= 2 && statements.every((item,i) => item[1] === String(i+1) || item[2] === circled[i])
    && (countChoices || choices.every(choice => /^[1-9①-⑨]+$/.test(combination(choice)) && [...combination(choice)].every(n => (/[1-9]/.test(n) ? Number(n)-1 : circled.indexOf(n)) < statements.length)));
  if (grouped) {
    const stem = formatQuestionText(stemText.slice(0,statements[0].index), number);
    return {
      stem: [stem, ...statements.map((item,i) =>
        circled[i]+' '+formatQuestionText(stemText.slice(item.index+item[0].length,statements[i+1]?.index).trim().replace(/\n\s*\n/g,'\n'))
      )].join('\n'),
      choices: countChoices ? choices : choices.map(choice => combination(choice).replace(/[1-9]/g,n => circled[Number(n)-1])),
    };
  }
  return {stem: formatQuestionText(stemText, number), choices: choices.map(choice => formatQuestionText(choice.replace(/\n\s*\n/g,'\n')))};
}
