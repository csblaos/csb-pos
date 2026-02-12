ALTER TABLE `users` ADD `system_role` text DEFAULT 'USER' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `can_create_stores` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `max_stores` integer;