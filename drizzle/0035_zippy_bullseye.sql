ALTER TABLE `orders` ADD `cod_returned_at` text;

UPDATE `orders`
SET `cod_returned_at` = coalesce(`shipped_at`, `created_at`)
WHERE `status` = 'COD_RETURNED'
  AND (`cod_returned_at` IS NULL OR trim(`cod_returned_at`) = '');

INSERT OR IGNORE INTO `permissions` (`id`, `key`, `resource`, `action`)
VALUES ('perm_orders_cod_return', 'orders.cod_return', 'orders', 'cod_return');

INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT rp.`role_id`, 'perm_orders_cod_return'
FROM `role_permissions` rp
WHERE rp.`permission_id` = 'perm_orders_ship';
