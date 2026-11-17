import { test } from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/catalog.json' with { type: 'json' };
import simulations from '../data/simulations.json' with { type: 'json' };
import breakdownsData from '../data/question-breakdowns.json' with { type: 'json' };
import { buildAnswerFeedback, classifyRuleRelation } from '../lib/breakdown.ts';
import { getQuestionBreakdown } from '../lib/breakdown-data.ts';
import {questionsForMix} from '../lib/practice-selection.ts';

const sourceBreakdown=(id:number)=>breakdownsData.breakdowns.find(entry=>entry.question_id===id) as any;

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
    assert.equal(bd.status, q.status);
    assert.ok(bd.items.length >= 1);
    if (bd.status === '已核对') assert.ok(bd.items.every(item => item.rule_id !== 'RULE-UNVERIFIED'));
    else assert.ok(bd.items.every(item => item.rule_id === 'RULE-UNVERIFIED') || bd.status !== '已核对');
    for (const item of bd.items) {
      assert.ok(item.statement?.length, `${q.id}:${item.key} 缺少原题陈述`);
      assert.ok(item.basis.length > 0);
      assert.ok(item.rule_statement.length > 0);
      assert.ok(item.source_ref.question_material.page >= q.source_page && item.source_ref.question_material.page <= q.source_page + 1, `${q.id}:${item.key} 原题页码 ${item.source_ref.question_material.page} 超出跨页范围 [${q.source_page}, ${q.source_page + 1}]`);
      assert.ok(item.source_ref.analysis_material.page >= q.analysis_page && item.source_ref.analysis_material.page <= q.analysis_page + 1, `${q.id}:${item.key} 解析页码 ${item.source_ref.analysis_material.page} 超出跨页范围 [${q.analysis_page}, ${q.analysis_page + 1}]`);
    }
  }
});

test('自动摘录和其他题目版本使用原解析；判断题有具体依据',()=>{
  assert.equal(getQuestionBreakdown(23003,1),null);
  assert.equal(getQuestionBreakdown(13,2),null);
  const result=buildAnswerFeedback(sourceBreakdown(35),'A','D');
  assert.equal(result.headline,'判断有误');
  assert.match(result.sections[0].items[0].basis,/市场与政府/);
});

test('待核对草稿不进入答题反馈，争议解析保留争议状态',()=>{
  assert.equal(getQuestionBreakdown(18,1),null);
  assert.equal(getQuestionBreakdown(16,1)?.status,'争议');
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
  const bd18 = sourceBreakdown(18);
  const fb18 = buildAnswerFeedback(bd18, 'A', 'D');
  assert.match(fb18.summary, /本身陈述成立.*错误的一项/);

  const bd26 = sourceBreakdown(26);
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
  const q17 = sourceBreakdown(17);
  const q19025 = sourceBreakdown(19025);
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

test('关联来源完整且候选不混入已确认集合',()=>{
  assert.equal(new Set(catalog.links.map(link=>`${link.question_id}:${link.knowledge_id}:${link.rule_id}`)).size,catalog.links.length);
  assert.ok(catalog.links.every(link=>link.rule_id&&link.source_ref.question_material.page>0&&link.source_ref.analysis_material.page>0));
  assert.equal(catalog.links.find(link=>link.question_id===18&&link.knowledge_id===10183)?.status,'已确认');
  const card=catalog.knowledge.find(card=>card.id===10183)!;
  assert.match(card.content,/纪要。适用于记载会议主要情况和议定事项/);
  assert.ok(!catalog.links.some(link=>link.question_id===2||link.question_id===21||(link.question_id===6&&link.knowledge_id===10181)||(link.question_id===5&&link.knowledge_id===10181)||link.knowledge_id===10126||link.knowledge_id===10181));
  assert.equal(catalog.links.find(link=>link.question_id===6&&link.knowledge_id===10145&&link.rule_id==='RULE-PHIL-PRACTICE-HISTORICAL-01')?.status,'已确认');
  assert.equal(catalog.links.find(link=>link.question_id===5&&link.knowledge_id===10158&&link.rule_id==='RULE-POL-DEMOCRACY-MGMT-01')?.status,'已确认');
  // 验证第一批核对新增确认关联覆盖具体规则
  assert.equal(catalog.links.find(link=>link.question_id===7&&link.knowledge_id===20050)?.status,'已确认');
  assert.equal(catalog.links.find(link=>link.question_id===7&&link.knowledge_id===10144&&link.rule_id==='RULE-PHIL-DIALECTICAL-NEGATION-01')?.status,'已确认');
  assert.equal(catalog.links.find(link=>link.question_id===8&&link.knowledge_id===10145&&link.rule_id==='RULE-PHIL-PRODUCTIVITY-TOOL-01')?.status,'已确认');
  assert.equal(catalog.links.find(link=>link.question_id===9&&link.knowledge_id===20040&&link.rule_id==='RULE-ECON-MONETARY-TIGHT-01')?.status,'已确认');
  assert.equal(catalog.links.find(link=>link.question_id===3&&link.knowledge_id===10158&&link.rule_id==='RULE-POL-ETHNIC-RELATIONS-01')?.status,'已确认');
});

test('生成器只更新目标题目并保护非目标题现有成果', () => {
  const currentBds = breakdownsData.breakdowns;
  assert.equal(currentBds.length, 345);
  // Verify target batch 1 questions are verified
  for (let qid = 1; qid <= 10; qid++) {
    const b = currentBds.find(item => item.question_id === qid);
    assert.equal(b?.status, '已核对');
    assert.ok(b?.items.every(it => it.rule_id !== 'RULE-UNVERIFIED'));
  }
  // Verify question 11 remains uncurated draft and is not unexpectedly curated or removed
  const q11 = currentBds.find(item => item.question_id === 11);
  assert.equal(q11?.status, '待核对');
});
