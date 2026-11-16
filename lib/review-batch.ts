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

export function groupReviewDates<T extends {due_date:string}>(reviews:T[], today:string, selectedDate='') {
  const groups=new Map<string,T[]>();
  for(const review of reviews){
    if(selectedDate&&review.due_date!==selectedDate)continue;
    const key=review.due_date<=today?'due':review.due_date;
    const group=groups.get(key);
    if(group)group.push(review);else groups.set(key,[review]);
  }
  return groups;
}

export function oldestOverdueDays(reviews:readonly {due_date:string}[], today:string) {
  return Math.max(0,...reviews.map(r=>(Date.parse(today)-Date.parse(r.due_date))/86_400_000));
}
