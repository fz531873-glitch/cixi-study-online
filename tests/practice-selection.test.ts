import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionsForMix, questionsForPaper, sampleQuestions } from '../lib/practice-selection.ts';

const makeQuestion=(id:number, exam:string, number:number, type:string, category?:string, status='已核对')=>({id,exam,number,type,category,status});
const questions=[
  makeQuestion(1,'真题卷',3,'多选'),
  makeQuestion(2,'真题卷',1,'单选'),
  makeQuestion(3,'模拟题 · 经济',1,'判断','经济学'),
  makeQuestion(4,'模拟题 · 法律',1,'多选','法律法规','争议'),
  makeQuestion(5,'真题卷',2,'判断'),
  makeQuestion(6,'模拟题 · 法律',2,'多选','法律法规'),
];

test('真题按原卷题号排序；混合筛选支持多个考点和题型',()=>{
  assert.deepEqual(questionsForPaper(questions,'真题卷').map(q=>q.id),[2,5,1]);
  const knowledge=[{id:20,category:'法律法规'},{id:21,category:'经济学'}];
  const links=[
    {knowledge_id:20,question_id:1,status:'已确认'},
    {knowledge_id:21,question_id:5,status:'待核对'},
  ];
  const filters={categories:['法律法规','经济学'],types:['判断','多选'],unseen:true};
  assert.deepEqual(questionsForMix(questions,knowledge,links,new Set([6]),filters).map(q=>q.id),[1,3]);
  assert.deepEqual(questionsForMix(questions,knowledge,links,new Set([6]),{categories:[],types:[],unseen:false}).map(q=>q.id),[1,2,3,5,6]);
});

test('抽题不重复、不改动原列表，题量不足时返回全部符合的题',()=>{
  const ids=questions.map(q=>q.id);
  const sampled=sampleQuestions(ids,3);
  assert.equal(new Set(sampled).size,3);
  assert.ok(sampled.every(id=>ids.includes(id)));
  assert.deepEqual(ids,[1,2,3,4,5,6]);
  assert.deepEqual(sampleQuestions(ids,45).sort(),ids);
});
