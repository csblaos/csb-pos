ALTER TABLE `system_config` ADD `store_logo_max_size_mb` integer NOT NULL DEFAULT 5;--> statement-breakpoint
ALTER TABLE `system_config` ADD `store_logo_auto_resize` integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `system_config` ADD `store_logo_resize_max_width` integer NOT NULL DEFAULT 1280;--> statement-breakpoint
UPDATE `system_config`
SET
  `store_logo_max_size_mb` = coalesce(`store_logo_max_size_mb`, 5),
  `store_logo_auto_resize` = coalesce(`store_logo_auto_resize`, 1),
  `store_logo_resize_max_width` = coalesce(`store_logo_resize_max_width`, 1280),
  `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'global';
