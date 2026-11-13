import { createEmptyCard, fsrs, Rating, State, type Grade } from 'ts-fsrs';
import { z } from 'zod';

export { Rating };

const day = 86_400_000;
const beijingDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' });
const scheduler = fsrs({ request_retention: 0.9, enable_short_term: false, enable_fuzz: false });
const count = z.number().int().nonnegative();
const storedCard = z.object({
  model: z.literal('fsrs-6'),
  due: z.string().datetime(),
  last_review: z.string().datetime(),
  stability: z.number().finite().positive(),
  difficulty: z.number().min(1).max(10),
  elapsed_days: count,
  scheduled_days: count,
  learning_steps: z.literal(0),
  reps: count.min(1),
  lapses: count,
  state: z.nativeEnum(State).refine(state => state !== State.New),
});

export const memorySnapshot = z.string().max(1200).refine(value => {
  try {
    return storedCard.safeParse(JSON.parse(value)).success;
  } catch {
    return false;
  }
}, '记忆模型状态无效');

export function today(now = new Date()) {
  return beijingDate.format(now);
}

export function reviewMemory(previous: string | null, now: Date, grade: Grade) {
  // The scheduler counts UTC dates. Anchor it to the application's Beijing study day.
  const reviewDay = new Date(`${today(now)}T00:00:00.000Z`);
  const card = previous ? storedCard.parse(JSON.parse(previous)) : createEmptyCard(reviewDay);
  // Same-day successes do not push back an already scheduled review.
  if (card.last_review && grade !== Rating.Again && new Date(card.last_review).getTime() === reviewDay.getTime()) return null;

  const { card: updated } = scheduler.next(card, reviewDay, grade);
  if (grade === Rating.Again && updated.scheduled_days > 1) {
    updated.due = new Date(reviewDay.getTime() + day);
    updated.scheduled_days = 1;
  }
  return {
    dueDate: today(updated.due),
    memory: JSON.stringify({ model: 'fsrs-6', ...updated }),
  };
}
