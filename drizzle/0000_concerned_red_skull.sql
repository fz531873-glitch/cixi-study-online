CREATE TABLE `attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`question_id` integer NOT NULL,
	`answer` text NOT NULL,
	`confidence` text NOT NULL,
	`correct` integer NOT NULL,
	`disputed` integer NOT NULL,
	`error_reason` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attempt_user` ON `attempt` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `content_edit` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` integer NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `content_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` integer NOT NULL,
	`payload` text NOT NULL,
	`reason` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `link_decision` (
	`user_id` text NOT NULL,
	`knowledge_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `knowledge_id`, `question_id`)
);
--> statement-breakpoint
CREATE TABLE `progress` (
	`user_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recall` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`knowledge_id` integer NOT NULL,
	`rating` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` integer NOT NULL,
	`due_date` text NOT NULL,
	`stage` integer NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `item_id`)
);
