CREATE TABLE `idempotency_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL REFERENCES stores(id) ON DELETE cascade,
	`action` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text NOT NULL DEFAULT 'PROCESSING',
	`response_status` integer,
	`response_body` text,
	`created_by` text REFERENCES users(id) ON DELETE set null,
	`created_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`completed_at` text
);--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_requests_store_action_key_unique` ON `idempotency_requests` (`store_id`,`action`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idempotency_requests_store_created_at_idx` ON `idempotency_requests` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idempotency_requests_status_created_at_idx` ON `idempotency_requests` (`status`,`created_at`);
