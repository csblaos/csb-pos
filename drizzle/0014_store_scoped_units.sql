ALTER TABLE `units` ADD `scope` text NOT NULL DEFAULT 'SYSTEM';--> statement-breakpoint
ALTER TABLE `units` ADD `store_id` text REFERENCES stores(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `units` SET `scope` = 'SYSTEM' WHERE `scope` IS NULL OR `scope` = '';--> statement-breakpoint
UPDATE `units` SET `store_id` = NULL WHERE `scope` = 'SYSTEM';--> statement-breakpoint
DROP INDEX IF EXISTS `units_code_unique`;--> statement-breakpoint
CREATE INDEX `units_store_id_idx` ON `units` (`store_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `units_system_code_unique` ON `units` (`code`) WHERE `scope` = 'SYSTEM';--> statement-breakpoint
CREATE UNIQUE INDEX `units_store_code_unique` ON `units` (`store_id`, `code`) WHERE `scope` = 'STORE';--> statement-breakpoint
INSERT OR IGNORE INTO `units` (`id`, `code`, `name_th`, `scope`, `store_id`)
VALUES
  ('unit_sys_pcs', 'PCS', 'ชิ้น', 'SYSTEM', NULL),
  ('unit_sys_pack', 'PACK', 'แพ็ก', 'SYSTEM', NULL),
  ('unit_sys_box', 'BOX', 'กล่อง', 'SYSTEM', NULL);
