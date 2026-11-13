import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitQuestionOptions } from '../lib/question-options.ts';
import catalog from '../data/catalog.json' with { type: 'json' };
import simulations from '../data/simulations.json' with { type: 'json' };

test('题干和四个独立选项按原顺序拆分，保留题干换行', () => {
  assert.deepEqual(splitQuestionOptions('阅读材料。\r\n回答问题。\r\nA. 甲\r\n\r\nB、乙\r\nC．丙\r\nD. 丁\r\n'), {
    stem: '阅读材料。\n回答问题。',
    choices: ['甲', '乙', '丙', '丁'],
  });
});

test('同排、跨行、缺失或错序的选项保留原文', () => {
  for (const body of [
    '题干\nA. 甲 B. 乙\nB. 乙\nC. 丙\nD. 丁',
    '题干\nA. 甲\nB. 乙\nC. 丙\nD. 丁 E. 戊',
    '题干\nA. 甲\n选项续行\nB. 乙\nC. 丙\nD. 丁',
    '题干\nA. 甲\nC. 丙\nD. 丁',
    '题干\nB. 乙\nA. 甲\nC. 丙\nD. 丁',
    '题干\nA.   \nB. 乙\nC. 丙\nD. 丁',
    '题干\nA. 甲\nB. 乙\nC. 丙\nD. 丁\n补充材料',
  ]) assert.equal(splitQuestionOptions(body), null);
});

test('真实题库覆盖漫画题、模拟题和原文回退', () => {
  const body = (id: number) => catalog.questions.find(q => q.id === id)!.body;
  assert.deepEqual(splitQuestionOptions(body(23103))?.choices, ['未雨绸缪', '民主集中', '立竿见影', '贵在行动']);
  assert.equal(splitQuestionOptions(body(1)), null);
  assert.equal(splitQuestionOptions(body(19031)), null);
  assert.equal(splitQuestionOptions(simulations.questions[0].body)?.choices[3], '乌兹别克斯坦');
});
