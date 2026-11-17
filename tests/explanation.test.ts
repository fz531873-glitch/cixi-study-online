import {test} from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/catalog.json' with {type:'json'};
import simulations from '../data/simulations.json' with {type:'json'};
import {explanationParts} from '../lib/explanation.ts';

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
