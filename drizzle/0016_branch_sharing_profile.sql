ALTER TABLE `store_branches` ADD `source_branch_id` text REFERENCES store_branches(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `store_branches` ADD `sharing_mode` text;--> statement-breakpoint
ALTER TABLE `store_branches` ADD `sharing_config` text;--> statement-breakpoint
CREATE INDEX `store_branches_source_branch_id_idx` ON `store_branches` (`source_branch_id`);--> statement-breakpoint
UPDATE `store_branches`
SET `sharing_mode` = CASE
  WHEN `code` = 'MAIN' THEN 'MAIN'
  ELSE 'BALANCED'
END
WHERE `sharing_mode` IS NULL OR `sharing_mode` = '';
