ALTER TABLE `users` ADD `created_by` text REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `users` ADD `must_change_password` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `password_updated_at` text;--> statement-breakpoint
UPDATE `users` SET `password_updated_at` = `created_at` WHERE `password_updated_at` IS NULL;--> statement-breakpoint
CREATE INDEX `users_created_by_idx` ON `users` (`created_by`);--> statement-breakpoint
CREATE INDEX `users_must_change_password_idx` ON `users` (`must_change_password`);--> statement-breakpoint
ALTER TABLE `store_members` ADD `added_by` text REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `store_members_added_by_idx` ON `store_members` (`added_by`);
