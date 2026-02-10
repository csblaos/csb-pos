# Drizzle Migration Notes (SQLite/Turso)

This project uses Drizzle ORM with the Turso/libSQL driver and a SQLite-compatible schema.

## 1) Configure database URL

Set environment variables (copy from `.env.example`):

```bash
cp .env.example .env.local
```

For local SQLite file:

```env
TURSO_DATABASE_URL=file:./local.db
TURSO_AUTH_TOKEN=
```

For Turso:

```env
TURSO_DATABASE_URL=libsql://<database-name>-<org>.turso.io
TURSO_AUTH_TOKEN=<token>
```

## 2) Generate migrations from schema

```bash
npm run db:generate
```

This reads `lib/db/schema/index.ts` and writes SQL files to `drizzle/`.

## 3) Apply schema

Choose one workflow:

- Fast sync (recommended for local dev):

```bash
npm run db:push
```

- Migration-based apply:

```bash
npm run db:migrate
```

## 4) Seed baseline data

```bash
npm run db:seed
```

Seed includes:
- default permission catalog (`resource.action`)
- default per-store roles (Owner, Manager, Staff, Viewer)
- role-permission bindings (Owner all permissions, Viewer `reports.view` only)
- sample store, owner user, units, products, contacts, and opening inventory movements

## Monetary convention

All money columns are stored as **integer smallest unit** (e.g. LAK):
- `orders.subtotal`, `orders.discount`, `orders.vat_amount`, `orders.shipping_fee_charged`, `orders.total`, `orders.shipping_cost`
- `products.price_base`, `products.cost_base`
- `order_items.price_base_at_sale`, `order_items.cost_base_at_sale`, `order_items.line_total`
