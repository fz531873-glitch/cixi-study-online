import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dailyQuote,dailyQuotes} from '../lib/daily-quote.ts';

test('同一北京时间日期返回同一句，不随打开次数变化',()=>{
  const morning=dailyQuote(new Date('2026-11-02T16:01:00Z'));
  const evening=dailyQuote(new Date('2026-11-03T15:59:59Z'));
  assert.deepEqual(morning,evening);
  assert.equal(morning.date,'2026-11-03');
  assert.equal(morning.text,'天行健，君子以自强不息。');
});
test('北京时间零点后切换下一句，包括跨月跨年',()=>{
  for(const date of ['2026-11-03','2026-11-30','2026-12-31']){
    const before=dailyQuote(new Date(date+'T15:59:59Z'));
    const after=dailyQuote(new Date(date+'T16:00:00Z'));
    assert.notEqual(before.date,after.date);assert.notEqual(before.text,after.text);
  }
});
test('31句均有出处，一个轮换周期内不重复，起始日期之前仍正常',()=>{
  assert.equal(dailyQuotes.length,31);
  assert.ok(dailyQuotes.every(q=>q.text.length>5&&q.source.length>1));
  const quotes=Array.from({length:31},(_,i)=>dailyQuote(new Date(Date.UTC(2026,10,3+i))).text);
  assert.equal(new Set(quotes).size,31);
  assert.equal(dailyQuote(new Date('2026-12-04T00:00:00Z')).text,quotes[0]);
  assert.ok(dailyQuote(new Date('2026-11-01T00:00:00Z')).text);
});
