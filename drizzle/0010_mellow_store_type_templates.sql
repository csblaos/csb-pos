CREATE TABLE `store_type_templates` (
	`store_type` text PRIMARY KEY NOT NULL,
	`app_layout` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `store_type_templates_app_layout_idx` ON `store_type_templates` (`app_layout`);
--> statement-breakpoint
INSERT INTO `store_type_templates` (`store_type`, `app_layout`, `display_name`, `description`)
VALUES
	('ONLINE_RETAIL', 'ONLINE_POS', 'Online POS', 'UI หลักสำหรับร้านค้าที่เน้นขายออนไลน์'),
	('RESTAURANT', 'RESTAURANT_POS', 'Restaurant POS', 'Template ขั้นต้นสำหรับร้านอาหาร'),
	('CAFE', 'CAFE_POS', 'Cafe POS', 'Template ขั้นต้นสำหรับคาเฟ่'),
	('OTHER', 'OTHER_POS', 'Other POS', 'Template ขั้นต้นสำหรับธุรกิจอื่นๆ')
ON CONFLICT(`store_type`) DO UPDATE SET
	`app_layout` = excluded.`app_layout`,
	`display_name` = excluded.`display_name`,
	`description` = excluded.`description`,
	`updated_at` = CURRENT_TIMESTAMP;
