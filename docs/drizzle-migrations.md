# Drizzle Migration Notes

เอกสารนี้ถูกเก็บไว้เป็น historical note เท่านั้น

- legacy LibSQL/Drizzle tooling ถูกลบออกจาก repo แล้ว
- runtime หลักใช้ PostgreSQL อย่างเดียว
- ถ้าจะทำงานด้าน migration/schema ให้ใช้:
  - `postgres/migrations/`
  - `npm run db:migrate:postgres`
  - [docs/postgresql-sequelize-migration.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgresql-sequelize-migration.md)
