import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Rating, reviewMemory } from '../lib/memory.ts';

test('FSRS 区分反馈等级，并使用北京时间切换复习日', () => {
  const first = new Date('2026-11-13T15:59:00Z');
  const missed = reviewMemory(null, first, Rating.Again)!;
  const hard = reviewMemory(null, first, Rating.Hard)!;
  const good = reviewMemory(null, first, Rating.Good)!;
  assert.equal(missed.dueDate, '2026-11-14');
  assert.ok(missed.dueDate < hard.dueDate && hard.dueDate < good.dueDate);
  assert.equal(reviewMemory(good.memory, new Date('2026-11-13T15:59:59Z'), Rating.Good), null);
  const next = reviewMemory(good.memory, new Date('2026-11-13T16:00:00Z'), Rating.Good)!;
  assert.equal(JSON.parse(next.memory).elapsed_days, 1);
  assert.equal(JSON.parse(next.memory).reps, 2);
});

test('跨日连续成功后遗忘，重新排到次日', () => {
  const first = reviewMemory(null, new Date('2026-11-01T00:00:00Z'), Rating.Good)!;
  const second = reviewMemory(first.memory, new Date(first.dueDate), Rating.Good)!;
  assert.ok(second.dueDate > first.dueDate);
  const failed = reviewMemory(second.memory, new Date(second.dueDate), Rating.Again)!;
  assert.equal(Date.parse(failed.dueDate) - Date.parse(second.dueDate), 86_400_000);
  assert.equal(JSON.parse(failed.memory).lapses, 1);
});
