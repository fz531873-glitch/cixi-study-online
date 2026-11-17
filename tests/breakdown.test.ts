import { test } from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/catalog.json' with { type: 'json' };
import simulations from '../data/simulations.json' with { type: 'json' };
import breakdownsData from '../data/question-breakdowns.json' with { type: 'json' };
import { buildAnswerFeedback, classifyRuleRelation } from '../lib/breakdown.ts';
import { getQuestionBreakdown } from '../lib/breakdown-data.ts';
import {questionsForMix} from '../lib/practice-selection.ts';

test('15个考点覆盖535道题，按公文写作抽到真实试卷和模拟题',()=>{
  const categories=new Set(catalog.knowledge.map(k=>k.category));
  const questions=[...catalog.questions,...simulations.questions];
  assert.equal(categories.size,15);
  assert.equal(questions.length,535);
  assert.ok(questions.every(q=>categories.has(q.category)));
  const pool=questionsForMix(questions,catalog.knowledge,catalog.links,new Set(),{categories:['公文写作'],types:[],unseen:false});
  assert.ok(pool.some(q=>q.id===17));
  assert.ok(pool.some(q=>q.id>=500000));
  assert.ok(pool.every(q=>q.category==='公文写作'&&q.status!=='争议'));
});

test('345道真题稿件覆盖全部题号、版本号与资料页码定位', () => {
  assert.equal(breakdownsData.count, 345);
  assert.equal(breakdownsData.breakdowns.length, catalog.questions.length);
  for (const q of catalog.questions) {
    const bd = breakdownsData.breakdowns.find(entry=>entry.question_id===q.id);
    assert.ok(bd, `缺少题目 ${q.id} 的逐项讲解`);
    assert.equal(bd.version, q.version);
    assert.ok(bd.items.length >= 1);
    if (bd.status === '已核对') assert.ok(bd.items.every(item => item.rule_id !== 'RULE-UNVERIFIED'));
    else if (bd.status === '待核对') assert.ok(bd.items.every(item => item.rule_id === 'RULE-UNVERIFIED'));
    for (const item of bd.items) {
      assert.ok(item.basis.length > 0);
      assert.ok(item.rule_statement.length > 0);
      assert.equal(item.source_ref.question_material.page,q.source_page);
      assert.equal(item.source_ref.analysis_material.page,q.analysis_page);
    }
  }
});

test('自动摘录和其他题目版本使用原解析；判断题有具体依据',()=>{
  assert.equal(getQuestionBreakdown(23003,1),null);
  assert.equal(getQuestionBreakdown(13,2),null);
  const result=buildAnswerFeedback(getQuestionBreakdown(35,1)!,'A','D');
  assert.equal(result.headline,'判断有误');
  assert.match(result.sections[0].items[0].basis,/市场与政府/);
});

test('第13题 A、B、C、D 四种作答给出差异化反馈', () => {
  const bd = getQuestionBreakdown(13, 1)!;
  assert.ok(bd);

  const fbA = buildAnswerFeedback(bd, 'A', 'D');
  assert.match(fbA.headline, /漏选了 ④/);

  const fbB = buildAnswerFeedback(bd, 'B', 'D');
  assert.match(fbB.summary, /优先纠正误选的 ①/);
  assert.equal(fbB.sections[0].items[0].key, '①');
  assert.ok(fbB.sections.some(s => s.items.some(i => i.key === '④' && i.statement_truth === true)));

  const fbC = buildAnswerFeedback(bd, 'C', 'D');
  assert.match(fbC.headline, /错选\/多选了 ①/);

  const fbD = buildAnswerFeedback(bd, 'D', 'D');
  assert.match(fbD.headline, /回答正确/);
});

test('第18题反向设问、第26题多选漏选错选、第16题争议留空', () => {
  const bd18 = getQuestionBreakdown(18, 1)!;
  const fb18 = buildAnswerFeedback(bd18, 'A', 'D');
  assert.match(fb18.summary, /本身陈述成立.*错误的一项/);

  const bd26 = getQuestionBreakdown(26, 1)!;
  const fb26 = buildAnswerFeedback(bd26, 'AB', 'BD');
  assert.match(fb26.headline, /错选了 A/);
  assert.match(fb26.headline, /漏选了 D/);

  const bd16 = getQuestionBreakdown(16, 1)!;
  const item1 = bd16.items.find(i => i.key === '①')!;
  assert.equal(item1.statement_truth, null);
  assert.equal(item1.matches_stem, null);
  assert.equal(item1.verdict, '存疑');
  assert.ok(item1.dispute_note);
  assert.ok(item1.source_ref.external?.includes('court.gov.cn'));
});

test('同规则换题识别与同卡不同规则反例', () => {
  const q17 = getQuestionBreakdown(17, 1)!;
  const q19025 = getQuestionBreakdown(19025, 1)!;
  const same = classifyRuleRelation(q17, q19025);
  assert.equal(same.relation, 'same_rule');
  assert.ok(same.sharedRuleIds.includes('RULE-DOC-LETTER-01'));

  const q13 = getQuestionBreakdown(13, 1)!;
  const q24107 = getQuestionBreakdown(24107, 1)!;
  const diff = classifyRuleRelation(q13, q24107, '①', '判断');
  assert.equal(diff.relation, 'same_card_different_rule');
  assert.ok(diff.sharedKnowledgeIds.includes(20003));
  assert.equal(classifyRuleRelation(breakdownsData.breakdowns.find(b=>b.question_id===23003) as any, breakdownsData.breakdowns.find(b=>b.question_id===23004) as any).relation, 'unrelated');
});
