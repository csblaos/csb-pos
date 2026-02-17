ALTER TABLE `purchase_orders` ADD `updated_by` text REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `updated_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP);--> statement-breakpoint
UPDATE `purchase_orders` SET `updated_at` = `created_at` WHERE `updated_at` IS NULL;--> statement-breakpoint
CREATE INDEX `po_updated_at_idx` ON `purchase_orders` (`store_id`,`updated_at`);--> statement-breakpoint

CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`store_id` text REFERENCES stores(id) ON DELETE set null,
	`actor_user_id` text REFERENCES users(id) ON DELETE set null,
	`actor_name` text,
	`actor_role` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`result` text NOT NULL DEFAULT 'SUCCESS',
	`reason_code` text,
	`ip_address` text,
	`user_agent` text,
	`request_id` text,
	`metadata` text,
	`before` text,
	`after` text,
	`occurred_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);--> statement-breakpoint
CREATE INDEX `audit_events_scope_occurred_at_idx` ON `audit_events` (`scope`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_events_store_occurred_at_idx` ON `audit_events` (`store_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_occurred_at_idx` ON `audit_events` (`actor_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_events_entity_occurred_at_idx` ON `audit_events` (`entity_type`,`entity_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_events_action_occurred_at_idx` ON `audit_events` (`action`,`occurred_at`);
