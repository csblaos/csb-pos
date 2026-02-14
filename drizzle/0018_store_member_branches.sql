CREATE TABLE `store_member_branches` (
  `store_id` text NOT NULL,
  `user_id` text NOT NULL,
  `branch_id` text NOT NULL,
  `created_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`branch_id`) REFERENCES `store_branches`(`id`) ON UPDATE no action ON DELETE cascade,
  PRIMARY KEY(`store_id`, `user_id`, `branch_id`)
);--> statement-breakpoint
CREATE INDEX `store_member_branches_store_user_idx` ON `store_member_branches` (`store_id`, `user_id`);--> statement-breakpoint
CREATE INDEX `store_member_branches_branch_idx` ON `store_member_branches` (`branch_id`);
