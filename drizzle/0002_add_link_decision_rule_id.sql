CREATE TABLE `link_decision_new` (
	`user_id` text NOT NULL,
	`knowledge_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`rule_id` text NOT NULL DEFAULT '',
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `knowledge_id`, `question_id`, `rule_id`)
);
--> statement-breakpoint
INSERT INTO `link_decision_new` (`user_id`, `knowledge_id`, `question_id`, `rule_id`, `status`, `reason`, `updated_at`)
  SELECT `user_id`, `knowledge_id`, `question_id`, '', `status`, `reason`, `updated_at` FROM `link_decision`;
--> statement-breakpoint
DROP TABLE `link_decision`;
--> statement-breakpoint
ALTER TABLE `link_decision_new` RENAME TO `link_decision`;
