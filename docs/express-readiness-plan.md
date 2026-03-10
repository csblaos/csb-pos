# Express Readiness Plan

เอกสารนี้ใช้วางแผนเตรียม codebase ให้ย้าย API จาก `Next.js App Router` ไป `Express + TypeScript` ได้ง่าย
โดยไม่รีบย้าย transport ทันที แต่ค่อยแยก boundary ให้ชัดก่อน

## เป้าหมาย

- ลดการผูก business logic กับ `NextRequest` / `NextResponse`
- ทำให้ `route -> service -> repository` แยกหน้าที่ชัด
- เตรียมให้ Next UI กับ Express API อยู่ร่วมกันได้ช่วงหนึ่ง
- ลดต้นทุนการย้ายหลัง PostgreSQL cutover เสร็จ

## หลักการ

1. ไม่ย้ายเป็น big-bang
2. แยก transport adapter ออกจาก business layer ก่อน
3. service/repository ต้องคืนค่าเป็น plain object
4. validation schema ใช้ซ้ำได้ทั้ง Next และ Express
5. request metadata เช่น `ip`, `requestId`, `actor`, `storeId` ต้องถูก map เป็น context object กลาง ไม่ส่ง `Request` ลงลึกเกินจำเป็น

## สถานะปัจจุบันจาก audit

### พร้อมต่อการแยก transport ค่อนข้างดี

- query-first PostgreSQL layer อยู่แล้ว:
  - [lib/db/sequelize.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/sequelize.ts)
  - [lib/db/query.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/query.ts)
  - [lib/db/transaction.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/transaction.ts)
- หลายโดเมนมี service/query helper แยกจาก route แล้ว
- `orders`, `purchase`, `inventory`, `reports` มีแนว repository/query-first ชัดขึ้นจาก phase migration ก่อนหน้า

### จุดที่ยังผูกกับ Next/Request อยู่

- route handlers ใน `app/api/**/route.ts` ยัง parse request และจัด response เองทั้งหมด
- service บางตัวรับ `Request` ตรง:
  - [server/services/audit.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/audit.service.ts)
  - [server/services/purchase.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/purchase.service.ts)
  - [lib/orders/postgres-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/orders/postgres-write.ts)
  - [lib/purchases/postgres-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/purchases/postgres-write.ts)
  - [lib/inventory/postgres-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/inventory/postgres-write.ts)
- idempotency ยังผูกกับ `Request` ที่ [server/services/idempotency.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/idempotency.service.ts)
- auth/middleware/session ยังพึ่ง Next runtime โดยธรรมชาติ:
  - [lib/auth/middleware.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/middleware.ts)
  - [lib/auth/session-db.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/session-db.ts)

## Target Boundary

```text
Next route / Express route
  -> transport adapter
  -> request mapper
  -> service/use-case
  -> repository/query layer
  -> response mapper
```

### สิ่งที่ transport adapter ควรทำ

- parse params/query/body
- อ่าน session/user/store context
- map headers/request metadata เป็น context object
- map domain error -> HTTP status
- serialize response

### สิ่งที่ service/use-case ควรทำ

- business rules
- transaction orchestration
- call repositories
- call audit/idempotency ผ่าน context object

### สิ่งที่ repository ควรทำ

- query DB
- map row -> DTO
- ไม่รู้จัก HTTP framework

## Context Object ที่ควรมี

แนะนำสร้าง object กลางลักษณะนี้:

```ts
type RequestContext = {
  requestId?: string | null;
  ipAddress?: string | null;
  actorUserId?: string | null;
  activeStoreId?: string | null;
  userAgent?: string | null;
};
```

ใช้แทนการส่ง `Request` ลง service/repository โดยตรง

## ลำดับการเตรียม

### Phase 1: Introduce Transport-Agnostic Context

สิ่งที่ต้องทำ:

1. เพิ่ม helper สำหรับ map `Request -> RequestContext`
2. เปลี่ยน `audit.service` ให้รับ `RequestContext` เป็นหลัก
3. เปลี่ยน `idempotency.service` ให้แยกส่วนที่ต้องอ่าน header/body ออกจาก core logic

ผลลัพธ์ที่ต้องการ:

- service ชั้นลึกไม่ต้องแตะ `Request`
- Next route กับ Express route ใช้ mapper เดียวกันได้

### Phase 2: Extract Route-Level Adapters

เริ่มจากโดเมนที่คุ้มที่สุด:

1. `orders`
2. `stock/purchase`
3. `reports`

สิ่งที่ต้องทำ:

- แยก parse/validate/request-mapping ออกจาก `route.ts`
- สร้าง helper แนว `handleRouteAction(...)` หรือ per-domain controller adapter
- ทำ error mapping กลางแทนการเขียน `NextResponse.json(...)` ซ้ำหลาย route

### Phase 3: Normalize Service Signatures

ตัวอย่างเป้าหมาย:

จาก:

```ts
service.doThing({ request, session, body })
```

เป็น:

```ts
service.doThing({
  context,
  actor,
  storeId,
  input,
})
```

### Phase 4: Express Pilot Slice

โดเมนที่แนะนำให้ pilot ก่อน:

- `reports`

เหตุผล:

- read-heavy
- side effects ต่ำ
- dependency กับ stock truth ชัด
- วัด success/failure ง่าย

โดเมนถัดไป:

- `orders` read
- `purchase` read

ยังไม่ควรเริ่มที่:

- auth/session
- high-risk order writes

### Phase 5: Coexistence Plan

รูปแบบที่แนะนำ:

- Next.js คงเป็น UI host ต่อไป
- Express แยกเป็น API app
- migration เป็นแบบ domain-by-domain

ตัวเลือกการ coexist:

1. Next route บางตัว proxy ไป Express
2. frontend ค่อย ๆ เปลี่ยนไปเรียก Express โดยตรงผ่าน env base URL
3. internal cron/jobs ย้ายไป Express ก่อน

คำแนะนำ:

- เริ่มจาก `proxy via Next` ก่อนเพื่อลดผลกระทบ frontend

## Candidate First Moves

### Move 1

แยก `RequestContext` helper และ refactor:

- [server/services/audit.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/audit.service.ts)
- [server/services/idempotency.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/idempotency.service.ts)

### Move 2

ทำ controller adapter pattern สำหรับ:

- [app/api/orders/[orderId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/route.ts)
- [app/api/orders/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/route.ts)

### Move 3

pilot read-only slice:

- `/reports`
- outstanding export/statement endpoints

## Validation Criteria

ถือว่า phase readiness นี้เริ่มสำเร็จเมื่อ:

- service สำคัญไม่ต้องรับ `Request` ตรงใน path ใหม่
- route handlers บางลงและเหลือ transport concerns เป็นหลัก
- มีอย่างน้อย 1 domain ที่สามารถย้ายไป Express ได้โดย reuse service/repository เดิม

## Rollback Rules

ถ้า refactor boundary แล้ว route เริ่มเพี้ยน:

1. revert เฉพาะ adapter layer ของโดเมนนั้น
2. อย่า refactor หลาย domain พร้อมกัน
3. rerun lint/build และ smoke ของ domain นั้นก่อนเดินต่อ

## Recommended Next Phase

หลังจาก phase นี้ ควรทำ `RequestContext + audit/idempotency decoupling plan`

เพราะสองก้อนนี้เป็นจุดผูก `Request` ที่กระทบหลาย route ที่สุด และถ้าแยกได้ก่อน จะลดต้นทุนการย้าย `orders`, `purchase`, และ `stock` ไป Express มากที่สุด
