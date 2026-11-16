import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyPlan } from '../lib/daily-plan.ts';
import { groupReviewDates, nextDate, oldestOverdueDays, reviewDateLabel } from '../lib/review-batch.ts';

test('复习中心合并今天及逾期复习，未来按日期安排',()=>{
  const dates=['2026-11-04','2026-11-09','2026-11-16','2026-11-17','2026-11-18'];
  const reviews=dates.map(due_date=>({due_date}));
  const groups=groupReviewDates(reviews,'2026-11-16');
  assert.deepEqual([...groups.keys()],['due','2026-11-17','2026-11-18']);
  assert.deepEqual(groups.get('due'),reviews.slice(0,3));
  assert.equal(oldestOverdueDays(groups.get('due')!,'2026-11-16'),12);
  assert.deepEqual([...groupReviewDates(reviews,'2026-11-16','2026-11-17').values()],[reviews.slice(3,4)]);
});

test('按北京时间统计任务，同题重复、争议题和模拟新题不会虚增今日进度', () => {
  const previous = '2026-11-15T15:59:59.000Z';
  const now = '2026-11-15T16:00:00.000Z';
  const questions = [
    ...[1,2,3].map(id=>({id,status:'已核对'})),
    {id:4,status:'争议'}, {id:5,status:'已核对',kind:'模拟题'},
  ];
  const attempts = [
    {question_id:1,kind:'首次',created_at:previous,disputed:0},
    {question_id:1,kind:'重复',created_at:now,disputed:0},
    ...[2,4,5].map(question_id=>({question_id,kind:'首次',created_at:now,disputed:Number(question_id===4)})),
    {question_id:2,kind:'重复',created_at:now,disputed:0},
  ];
  const recalls = [{knowledge_id:21,first_at:previous,last_at:now}];
  const due = [{kind:'question',item_id:1,due_date:'2026-11-16'},{kind:'knowledge',item_id:22,due_date:'2026-11-16'}];
  const plan=dailyPlan('2026-11-16',questions,attempts,recalls,due);
  assert.deepEqual(plan,{done:3,reviewTotal:3,newTotal:2,fresh:[questions[2]],pending:[due[1]],includesKnowledge:true});
});

test('复习日期跨月跨年仍按北京时间的日历日期显示', () => {
  assert.equal(nextDate('2026-12-31',1),'2027-01-01');
  assert.equal(reviewDateLabel('2027-01-01','2026-12-31'),'明天');
  assert.equal(reviewDateLabel('2026-12-31','2026-12-31'),'今天');
  assert.equal(reviewDateLabel('2027-01-02','2026-12-31'),'1月2日');
});
