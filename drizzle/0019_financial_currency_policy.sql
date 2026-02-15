ALTER TABLE `stores` ADD `supported_currencies` text NOT NULL DEFAULT '["LAK"]';--> statement-breakpoint
ALTER TABLE `stores` ADD `vat_mode` text NOT NULL DEFAULT 'EXCLUSIVE';--> statement-breakpoint
UPDATE `stores`
SET `supported_currencies` =
  CASE
    WHEN `currency` IN ('LAK', 'THB', 'USD') THEN '["' || `currency` || '"]'
    ELSE '["LAK"]'
  END
WHERE `supported_currencies` IS NULL OR trim(`supported_currencies`) = '';--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_currency` text NOT NULL DEFAULT 'LAK';--> statement-breakpoint
UPDATE `orders`
SET `payment_currency` =
  CASE
    WHEN `store_id` IN (SELECT `id` FROM `stores`) THEN (
      SELECT
        CASE
          WHEN `stores`.`currency` IN ('LAK', 'THB', 'USD') THEN `stores`.`currency`
          ELSE 'LAK'
        END
      FROM `stores`
      WHERE `stores`.`id` = `orders`.`store_id`
      LIMIT 1
    )
    ELSE 'LAK'
  END
WHERE `payment_currency` IS NULL OR trim(`payment_currency`) = '';
