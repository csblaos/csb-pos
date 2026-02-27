ALTER TABLE `purchase_orders` ADD `exchange_rate_locked_at` text;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `exchange_rate_locked_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `exchange_rate_lock_note` text;--> statement-breakpoint
UPDATE `purchase_orders`
SET
  `exchange_rate_locked_at` = coalesce(`updated_at`, `created_at`, CURRENT_TIMESTAMP),
  `exchange_rate_locked_by` = coalesce(`updated_by`, `created_by`)
WHERE `exchange_rate_locked_at` IS NULL;--> statement-breakpoint
CREATE INDEX `po_exchange_rate_locked_at_idx` ON `purchase_orders` (`store_id`,`exchange_rate_locked_at`);
