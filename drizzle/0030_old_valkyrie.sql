ALTER TABLE `purchase_orders` ADD `exchange_rate_initial` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `payment_status` text DEFAULT 'UNPAID' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `paid_at` text;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `paid_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `payment_reference` text;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `payment_note` text;--> statement-breakpoint
UPDATE `purchase_orders`
SET `exchange_rate_initial` = coalesce(`exchange_rate_initial`, `exchange_rate`, 1)
WHERE `exchange_rate_initial` IS NULL OR `exchange_rate_initial` <= 0;--> statement-breakpoint
UPDATE `purchase_orders`
SET `payment_status` = CASE
  WHEN `paid_at` IS NOT NULL AND trim(`paid_at`) <> '' THEN 'PAID'
  ELSE 'UNPAID'
END
WHERE `payment_status` IS NULL OR trim(`payment_status`) = '';--> statement-breakpoint
CREATE INDEX `po_payment_status_paid_at_idx` ON `purchase_orders` (`store_id`,`payment_status`,`paid_at`);--> statement-breakpoint
CREATE INDEX `po_supplier_received_at_idx` ON `purchase_orders` (`store_id`,`supplier_name`,`received_at`);
