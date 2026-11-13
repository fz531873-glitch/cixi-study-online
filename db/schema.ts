import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const attempts = sqliteTable('attempt', {
  id: text('id').primaryKey(), user_id: text('user_id').notNull(), question_id: integer('question_id').notNull(),
  answer: text('answer').notNull(), confidence: text('confidence').notNull(), correct: integer('correct').notNull(),
  disputed: integer('disputed').notNull(), error_reason: text('error_reason').notNull().default(''),
  kind: text('kind').notNull(), snapshot: text('snapshot').notNull(), created_at: text('created_at').notNull(),
}, t => [index('attempt_user').on(t.user_id, t.created_at)]);
export const recalls = sqliteTable('recall', {
  id: text('id').primaryKey(), user_id: text('user_id').notNull(), knowledge_id: integer('knowledge_id').notNull(),
  rating: text('rating').notNull(), created_at: text('created_at').notNull(),
});
export const reviews = sqliteTable('review', {
  user_id: text('user_id').notNull(), kind: text('kind').notNull(), item_id: integer('item_id').notNull(),
  due_date: text('due_date').notNull(), stage: integer('stage').notNull(), memory: text('memory'),
}, t => [primaryKey({columns: [t.user_id, t.kind, t.item_id]})]);
export const progress = sqliteTable('progress', {
  user_id: text('user_id').primaryKey(), payload: text('payload').notNull(), updated_at: text('updated_at').notNull(),
});
export const edits = sqliteTable('content_edit', {
  user_id: text('user_id').notNull(), kind: text('kind').notNull(), item_id: integer('item_id').notNull(),
  payload: text('payload').notNull(), revision: integer('revision').notNull(), updated_at: text('updated_at').notNull(),
}, t => [primaryKey({columns: [t.user_id, t.kind, t.item_id]})]);
export const history = sqliteTable('content_history', {
  id: text('id').primaryKey(), user_id: text('user_id').notNull(), kind: text('kind').notNull(), item_id: integer('item_id').notNull(),
  payload: text('payload').notNull(), reason: text('reason').notNull(), revision: integer('revision').notNull(), created_at: text('created_at').notNull(),
});
export const links = sqliteTable('link_decision', {
  user_id: text('user_id').notNull(), knowledge_id: integer('knowledge_id').notNull(), question_id: integer('question_id').notNull(),
  status: text('status').notNull(), reason: text('reason').notNull(), updated_at: text('updated_at').notNull(),
}, t => [primaryKey({columns: [t.user_id, t.knowledge_id, t.question_id]})]);
