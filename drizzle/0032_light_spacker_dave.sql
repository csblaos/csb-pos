CREATE TABLE `notification_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`topic` text DEFAULT 'PURCHASE_AP_DUE' NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`severity` text DEFAULT 'WARNING' NOT NULL,
	`status` text DEFAULT 'UNREAD' NOT NULL,
	`due_status` text,
	`due_date` text,
	`payload` text DEFAULT '{}' NOT NULL,
	`first_detected_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`last_detected_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`read_at` text,
	`resolved_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_inbox_store_dedupe_unique` ON `notification_inbox` (`store_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notification_inbox_store_status_detected_idx` ON `notification_inbox` (`store_id`,`status`,`last_detected_at`);--> statement-breakpoint
CREATE INDEX `notification_inbox_store_topic_detected_idx` ON `notification_inbox` (`store_id`,`topic`,`last_detected_at`);--> statement-breakpoint
CREATE INDEX `notification_inbox_store_entity_idx` ON `notification_inbox` (`store_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `notification_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`topic` text DEFAULT 'PURCHASE_AP_DUE' NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`muted_forever` integer DEFAULT false NOT NULL,
	`muted_until` text,
	`snoozed_until` text,
	`note` text,
	`updated_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_rules_store_topic_entity_unique` ON `notification_rules` (`store_id`,`topic`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `notification_rules_store_topic_idx` ON `notification_rules` (`store_id`,`topic`);--> statement-breakpoint
CREATE INDEX `notification_rules_store_entity_idx` ON `notification_rules` (`store_id`,`entity_type`,`entity_id`);