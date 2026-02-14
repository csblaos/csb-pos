INSERT INTO `store_branches` (
  `id`,
  `store_id`,
  `name`,
  `code`,
  `address`,
  `source_branch_id`,
  `sharing_mode`,
  `sharing_config`,
  `created_at`
)
SELECT
  lower(
    hex(randomblob(4)) || '-' ||
    hex(randomblob(2)) || '-' ||
    '4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
    hex(randomblob(6))
  ) AS id,
  s.`id`,
  'สาขาหลัก',
  'MAIN',
  NULL,
  NULL,
  'MAIN',
  NULL,
  CURRENT_TIMESTAMP
FROM `stores` s
LEFT JOIN `store_branches` b
  ON b.`store_id` = s.`id`
  AND b.`code` = 'MAIN'
WHERE b.`id` IS NULL;--> statement-breakpoint

UPDATE `store_branches`
SET `sharing_mode` = CASE
  WHEN `code` = 'MAIN' THEN 'MAIN'
  ELSE coalesce(`sharing_mode`, 'BALANCED')
END
WHERE `sharing_mode` IS NULL
   OR `sharing_mode` = '';--> statement-breakpoint

UPDATE `store_branches`
SET `source_branch_id` = (
  SELECT mb.`id`
  FROM `store_branches` mb
  WHERE mb.`store_id` = `store_branches`.`store_id`
    AND mb.`code` = 'MAIN'
  LIMIT 1
)
WHERE `code` <> 'MAIN'
  AND `source_branch_id` IS NULL
  AND `sharing_mode` IN ('BALANCED', 'FULL_SYNC');
