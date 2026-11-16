import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatQuestionAnalysis, splitQuestionOptions } from '../lib/question-options.ts';
import catalog from '../data/catalog.json' with { type: 'json' };
import simulations from '../data/simulations.json' with { type: 'json' };

test('题干合并 PDF 换行，四个独立选项保持原顺序', () => {
  assert.deepEqual(splitQuestionOptions('阅读材料。\r\n回答问题。\r\nA. 甲\r\n\r\nB、乙\r\nC．丙\r\nD. 丁\r\n'), {
    stem: '阅读材料。回答问题。',
    choices: ['甲', '乙', '丙', '丁'],
  });
});

test('重复、缺失、错序、空选项或歧义边界回退原文', () => {
  for (const body of [
    '题干\nA. 甲 B. 乙\nB. 乙\nC. 丙\nD. 丁',
    '题干\nA. 甲\nB. 乙\nC. 丙\nD. 丁 E. 戊',
    '题干\nA. 甲\nC. 丙\nD. 丁',
    '题干\nB. 乙\nA. 甲\nC. 丙\nD. 丁',
    '题干\nA.   \nB. 乙\nC. 丙\nD. 丁',
    '题干\nA. 甲\nB. 乙\nC. 丙\nD. 丁\n补充材料',
  ]) assert.equal(splitQuestionOptions(body), null);
});

test('真实题库覆盖同排、跨行、漫画题和模拟题', () => {
  const body = (id: number) => catalog.questions.find(q => q.id === id)!.body;
  assert.deepEqual(splitQuestionOptions(body(23103))?.choices, ['未雨绸缪', '民主集中', '立竿见影', '贵在行动']);
  assert.deepEqual(splitQuestionOptions(body(1),1)?.choices, ['坚持求同存异','坚持互利共赢','坚持独立自主','坚持公平正义']);
  assert.match(splitQuestionOptions(body(19031))!.choices[2], /治理能力现代化/);
  assert.match(splitQuestionOptions(body(24134))!.choices[1], /确保公文的专业性/);
  assert.equal(splitQuestionOptions(simulations.questions[0].body)?.choices[3], '乌兹别克斯坦');
});

test('上午卷第13题统一日期、编号和选项，解析不改普通数值', () => {
  const item = catalog.questions.find(q => q.id === 13)!;
  const parsed = splitQuestionOptions(item.body, item.number)!;
  assert.match(parsed.stem, /2025年4月27日，/);
  assert.equal(parsed.stem.split('\n').length,5);
  assert.match(parsed.stem, /\n① 全国人大常委会/);
  assert.deepEqual(parsed.choices,['②③','①④','①②③④','②③④']);
  assert.match(formatQuestionAnalysis(item.analysis), /①错误[\s\S]*②正确/);
  assert.equal(formatQuestionAnalysis('第123错误，1,000元，3.5%。'), '第123错误，1,000元，3.5%。');
  assert.deepEqual(splitQuestionOptions(catalog.questions.find(q => q.id === 19010)!.body)?.choices,['①③④','①②④','①②③','①②③④']);
});
