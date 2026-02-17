ALTER TABLE `products` ADD `out_stock_threshold` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `low_stock_threshold` integer;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `cancelled_at` text;--> statement-breakpoint
ALTER TABLE `stores` ADD `out_stock_threshold` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `low_stock_threshold` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `pdf_show_logo` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `pdf_show_signature` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `pdf_show_note` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `pdf_header_color` text DEFAULT '#f1f5f9' NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `pdf_company_name` text;--> statement-breakpoint
ALTER TABLE `stores` ADD `pdf_company_address` text;--> statement-breakpoint
ALTER TABLE `stores` ADD `pdf_company_phone` text;