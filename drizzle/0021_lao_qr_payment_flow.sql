ALTER TABLE `system_config`
ADD `payment_require_slip_for_lao_qr` integer NOT NULL DEFAULT 1;--> statement-breakpoint
UPDATE `system_config`
SET `payment_require_slip_for_lao_qr` = 1
WHERE `payment_require_slip_for_lao_qr` IS NULL;--> statement-breakpoint
ALTER TABLE `store_payment_accounts`
ADD `qr_image_url` text;--> statement-breakpoint
UPDATE `store_payment_accounts`
SET `account_type` = 'LAO_QR'
WHERE `account_type` = 'PROMPTPAY';--> statement-breakpoint
UPDATE `store_payment_accounts`
SET `account_type` = 'BANK'
WHERE `account_type` IS NULL
   OR trim(`account_type`) = ''
   OR `account_type` NOT IN ('BANK', 'LAO_QR');--> statement-breakpoint
ALTER TABLE `orders`
ADD `payment_method` text NOT NULL DEFAULT 'CASH';--> statement-breakpoint
ALTER TABLE `orders`
ADD `payment_account_id` text;--> statement-breakpoint
ALTER TABLE `orders`
ADD `payment_slip_url` text;--> statement-breakpoint
ALTER TABLE `orders`
ADD `payment_proof_submitted_at` text;--> statement-breakpoint
UPDATE `orders`
SET `payment_method` = 'CASH'
WHERE `payment_method` IS NULL
   OR trim(`payment_method`) = ''
   OR `payment_method` NOT IN ('CASH', 'LAO_QR');--> statement-breakpoint
CREATE INDEX `orders_store_payment_method_idx`
ON `orders` (`store_id`,`payment_method`);
