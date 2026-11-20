import {test} from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/catalog.json' with {type:'json'};
import simulations from '../data/simulations.json' with {type:'json'};
import {explanationParts,practiceExplanation} from '../lib/explanation.ts';
import {getQuestionBreakdown} from '../lib/breakdown-data.ts';
import {formatQuestionAnalysis} from '../lib/question-options.ts';

test('相同的解析只显示一次，包括模拟题和格式差异',()=>{
  for(const q of simulations.questions) {
    assert.ok(explanationParts(q.direct,q.analysis).summary,String(q.id));
    assert.equal(explanationParts(q.direct,q.analysis).full,'',String(q.id));
  }
  assert.equal(explanationParts('A 项错误，理由在题干。','A项错误,\n理由在题干').full,'');
  assert.equal(explanationParts('应计入1.2万元。','应计入12万元。').full,'应计入12万元。');
});

test('连续或分散的摘录保留全文，原出处补充的判断可展开',()=>{
  for(const id of [23003,23006]) {
    const q=catalog.questions.find(q=>q.id===id)!;
    const parts=explanationParts(q.direct,q.analysis);
    assert.equal(parts.isExcerpt,true,String(id));
    assert.equal(parts.full,q.analysis.trim(),String(id));
  }
  const parts=explanationParts('应排除①。','应排除①。④也成立。');
  assert.equal(parts.isExcerpt,true);
  assert.match(parts.full,/④也成立/);
});

test('独立的简析和记忆提示与原资料依据并存',()=>{
  const q=catalog.questions.find(q=>q.id===13)!;
  const parts=explanationParts(q.direct,q.analysis);
  assert.equal(parts.isExcerpt,false);
  assert.match(parts.summary,/决定权/);
  assert.match(parts.takeaway,/立法职能/);
  assert.equal(parts.full,q.analysis.trim());
  assert.equal(explanationParts('应排除①。记住：先看行为。','应排除①。').takeaway,'先看行为。');
});

const feedback=(id:number,chosen:string)=>{
  const question=[...catalog.questions,...simulations.questions].find(q=>q.id===id)!;
  const breakdown=getQuestionBreakdown(id,question.version);
  return practiceExplanation(question.direct,question.analysis,question.answer,chosen,breakdown);
};

test('会议题默认讲考点、错选原因与解题思路，折叠层保留其余选项和正文',()=>{
  const view=feedback(25101,'A');
  assert.match(view.summary,/全国统一大市场建设和海洋经济高质量发展。$/);
  assert.deepEqual(view.focus.map(item=>item.label),['为什么不选 A']);
  assert.match(view.thinking,/协调配合/);
  assert.deepEqual(view.extra.map(item=>item.key),['B','C','D']);
  assert.doesNotMatch(view.full,/参考答案|快速解题思路/);
  assert.match(formatQuestionAnalysis(view.full),/公开报道.*等问题/u);
  assert.equal(feedback(25101,'B').focus.length,0);
  assert.equal(feedback(25101,'').focus.length,0);
});

test('多选区分错选和漏选，组合题比较陈述，计数只比较数量，争议保留依据',()=>{
  assert.deepEqual(feedback(24026,'AC').focus.map(item=>item.label),['为什么不选 C','漏选 D']);
  assert.deepEqual(feedback(13,'A').focus.map(item=>item.label),['漏选 ④']);
  const count=feedback(24014,'D');
  assert.match(count.focus[0].text,/少算 1 项。计入的陈述是 ②。/);
  assert.match(count.full,/^第一步/);
  assert.doesNotMatch(count.full,/【答案】C/);
  const dispute=feedback(24031,'D');
  assert.match(dispute.summary,/8 月 29 日/);
  assert.equal(dispute.focus.length,0);
  assert.deepEqual(dispute.extra.map(item=>item.key),['判断']);
});

test('模拟题从已有解析抽出考点和错选原因，支持未拆分题降级显示',()=>{
  const mock=feedback(500001,'A');
  assert.match(mock.summary,/撒马尔罕位于乌兹别克斯坦/);
  assert.match(mock.focus[0].text,/杜尚别/);
  assert.deepEqual(mock.extra.map(item=>item.key),['B','C']);
  assert.equal(mock.full,'');
  const legacy=practiceExplanation('简析。','参考答案：B。\n【解析】理由一。\n\n理由二。','B','A');
  assert.equal(legacy.summary,'简析。');
  assert.equal(legacy.full,'理由一。\n\n理由二。');
});

test('解析合并 PDF 行尾断词，保留段落、圈号和数字标点',()=>{
  assert.equal(formatQuestionAnalysis('公\n开报道显示改革,保障民生。\n1正确，金额1,000元。\n\n另一段。'),
    '公开报道显示改革，保障民生。\n\n①正确，金额1,000元。\n\n另一段。');
});
