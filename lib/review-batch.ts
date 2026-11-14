export const reviewBatchLimit = 20;
export type ReviewItem = {kind: 'question' | 'knowledge'; item_id: number};
export type ReviewBatch = {items: ReviewItem[]; index: number; recalled?: boolean};
