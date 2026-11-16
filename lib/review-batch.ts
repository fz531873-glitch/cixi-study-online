export const reviewBatchLimit = 20;
export type ReviewItem = {kind: 'question' | 'knowledge'; item_id: number};
export type ReviewBatch = {items: ReviewItem[]; index: number; recalled?: boolean};

export function nextDate(date:string, days:number) {
  return new Date(Date.parse(date)+days*86_400_000).toISOString().slice(0,10);
}

export function reviewDateLabel(date:string, today:string) {
  if (date===today) return '今天';
  if (date===nextDate(today,1)) return '明天';
  return Number(date.slice(5,7))+'月'+Number(date.slice(8,10))+'日';
}
