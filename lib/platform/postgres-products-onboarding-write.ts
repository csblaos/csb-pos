import "server-only";

import { randomUUID } from "node:crypto";

import { execute, queryMany, queryOne } from "@/lib/db/query";
import { isPostgresConfigured } from "@/lib/db/sequelize";
import { runInTransaction } from "@/lib/db/transaction";

type UnitOption = {
  id: string;
  code: string;
  nameTh: string;
  scope: "SYSTEM" | "STORE";
  storeId: string | null;
};

type CategoryItem = {
  id: string;
  name: string;
  sortOrder: number;
  productCount: number;
};

type ChannelStatus = "DISCONNECTED" | "CONNECTED" | "ERROR";
type ChannelState = {
  facebook: ChannelStatus;
  whatsapp: ChannelStatus;
};

type UnitWriteResult =
  | { ok: true; unit: UnitOption }
  | { ok: false; error: "NOT_FOUND" | "SYSTEM_SCOPE" | "CONFLICT" | "IN_USE"; usage?: { productBaseCount: number; productConversionCount: number; orderItemCount: number } };

type CategoryWriteResult =
  | { ok: true; categories: CategoryItem[] }
  | { ok: false; error: "NOT_FOUND" | "CONFLICT" };

export const isPostgresProductsOnboardingWriteEnabled = () =>
  isPostgresConfigured();

export const logProductsOnboardingWriteFallback = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[products-onboarding.write.pg] fallback to turso for ${operation}: ${message}`);
};

const listUnitsDirectFromPostgres = async (storeId: string): Promise<UnitOption[]> =>
  queryMany<UnitOption>(
    `
      select
        id,
        code,
        name_th as "nameTh",
        scope,
        store_id as "storeId"
      from units
      where
        scope = 'SYSTEM'
        or (scope = 'STORE' and store_id = :storeId)
      order by case when scope = 'STORE' then 0 else 1 end, code asc
    `,
    {
      replacements: { storeId },
    },
  );

const listCategoriesDirectFromPostgres = async (storeId: string): Promise<CategoryItem[]> => {
  const rows = await queryMany<{
    id: string;
    name: string;
    sortOrder: number | string | null;
    productCount: number | string | null;
  }>(
    `
      select
        pc.id,
        pc.name,
        pc.sort_order as "sortOrder",
        count(p.id) as "productCount"
      from product_categories pc
      left join products p
        on p.category_id = pc.id
        and p.store_id = :storeId
      where pc.store_id = :storeId
      group by pc.id, pc.name, pc.sort_order
      order by pc.sort_order asc, pc.name asc
    `,
    {
      replacements: { storeId },
    },
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: Number(row.sortOrder ?? 0),
    productCount: Number(row.productCount ?? 0),
  }));
};

const readStoreChannelStatusDirectFromPostgres = async (storeId: string): Promise<ChannelState> => {
  const row = await queryOne<{
    facebook: ChannelStatus | null;
    whatsapp: ChannelStatus | null;
  }>(
    `
      select
        coalesce(
          (select status from fb_connections where store_id = :storeId limit 1),
          'DISCONNECTED'
        ) as facebook,
        coalesce(
          (select status from wa_connections where store_id = :storeId limit 1),
          'DISCONNECTED'
        ) as whatsapp
    `,
    {
      replacements: { storeId },
    },
  );

  return {
    facebook: row?.facebook ?? "DISCONNECTED",
    whatsapp: row?.whatsapp ?? "DISCONNECTED",
  };
};

export const createUnitInPostgres = async (input: {
  storeId: string;
  code: string;
  nameTh: string;
}): Promise<UnitWriteResult> => {
  const existing = await queryOne<{ id: string }>(
    `
      select id
      from units
      where
        code = :code
        and (
          scope = 'SYSTEM'
          or (scope = 'STORE' and store_id = :storeId)
        )
      limit 1
    `,
    {
      replacements: {
        storeId: input.storeId,
        code: input.code,
      },
    },
  );

  if (existing) {
    return { ok: false, error: "CONFLICT" };
  }

  const unitId = randomUUID();

  await execute(
    `
      insert into units (
        id,
        code,
        name_th,
        scope,
        store_id
      )
      values (
        :id,
        :code,
        :nameTh,
        'STORE',
        :storeId
      )
    `,
    {
      replacements: {
        id: unitId,
        code: input.code,
        nameTh: input.nameTh,
        storeId: input.storeId,
      },
    },
  );

  const unit = await queryOne<UnitOption>(
    `
      select
        id,
        code,
        name_th as "nameTh",
        scope,
        store_id as "storeId"
      from units
      where id = :unitId
      limit 1
    `,
    {
      replacements: { unitId },
    },
  );

  return {
    ok: true,
    unit: unit ?? {
      id: unitId,
      code: input.code,
      nameTh: input.nameTh,
      scope: "STORE",
      storeId: input.storeId,
    },
  };
};

export const updateUnitInPostgres = async (input: {
  storeId: string;
  unitId: string;
  code: string;
  nameTh: string;
}): Promise<UnitWriteResult> => {
  const targetUnit = await queryOne<{
    id: string;
    scope: "SYSTEM" | "STORE";
    storeId: string | null;
  }>(
    `
      select
        id,
        scope,
        store_id as "storeId"
      from units
      where id = :unitId
      limit 1
    `,
    {
      replacements: {
        unitId: input.unitId,
      },
    },
  );

  if (!targetUnit) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (targetUnit.scope === "SYSTEM") {
    return { ok: false, error: "SYSTEM_SCOPE" };
  }

  if (targetUnit.storeId !== input.storeId) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const existing = await queryOne<{ id: string }>(
    `
      select id
      from units
      where
        code = :code
        and (
          scope = 'SYSTEM'
          or (scope = 'STORE' and store_id = :storeId)
        )
      limit 1
    `,
    {
      replacements: {
        code: input.code,
        storeId: input.storeId,
      },
    },
  );

  if (existing && existing.id !== input.unitId) {
    return { ok: false, error: "CONFLICT" };
  }

  await execute(
    `
      update units
      set
        code = :code,
        name_th = :nameTh
      where id = :unitId
    `,
    {
      replacements: {
        unitId: input.unitId,
        code: input.code,
        nameTh: input.nameTh,
      },
    },
  );

  const unit = await queryOne<UnitOption>(
    `
      select
        id,
        code,
        name_th as "nameTh",
        scope,
        store_id as "storeId"
      from units
      where id = :unitId
      limit 1
    `,
    {
      replacements: {
        unitId: input.unitId,
      },
    },
  );

  return {
    ok: true,
    unit: unit ?? {
      id: input.unitId,
      code: input.code,
      nameTh: input.nameTh,
      scope: "STORE",
      storeId: input.storeId,
    },
  };
};

export const deleteUnitInPostgres = async (input: {
  storeId: string;
  unitId: string;
}): Promise<UnitWriteResult> => {
  const targetUnit = await queryOne<{
    id: string;
    scope: "SYSTEM" | "STORE";
    storeId: string | null;
  }>(
    `
      select
        id,
        scope,
        store_id as "storeId"
      from units
      where id = :unitId
      limit 1
    `,
    {
      replacements: {
        unitId: input.unitId,
      },
    },
  );

  if (!targetUnit) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (targetUnit.scope === "SYSTEM") {
    return { ok: false, error: "SYSTEM_SCOPE" };
  }

  if (targetUnit.storeId !== input.storeId) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const [baseUsage, conversionUsage, orderItemUsage] = await Promise.all([
    queryOne<{ count: number | string | null }>(
      `
        select count(*) as count
        from products
        where store_id = :storeId
          and base_unit_id = :unitId
      `,
      {
        replacements: input,
      },
    ),
    queryOne<{ count: number | string | null }>(
      `
        select count(*) as count
        from product_units pu
        inner join products p on pu.product_id = p.id
        where p.store_id = :storeId
          and pu.unit_id = :unitId
      `,
      {
        replacements: input,
      },
    ),
    queryOne<{ count: number | string | null }>(
      `
        select count(*) as count
        from order_items oi
        inner join orders o on oi.order_id = o.id
        where o.store_id = :storeId
          and oi.unit_id = :unitId
      `,
      {
        replacements: input,
      },
    ),
  ]);

  const usage = {
    productBaseCount: Number(baseUsage?.count ?? 0),
    productConversionCount: Number(conversionUsage?.count ?? 0),
    orderItemCount: Number(orderItemUsage?.count ?? 0),
  };

  if (usage.productBaseCount > 0 || usage.productConversionCount > 0 || usage.orderItemCount > 0) {
    return { ok: false, error: "IN_USE", usage };
  }

  await execute(
    `
      delete from units
      where id = :unitId
        and store_id = :storeId
    `,
    {
      replacements: input,
    },
  );

  return {
    ok: true,
    unit: {
      id: input.unitId,
      code: "",
      nameTh: "",
      scope: "STORE",
      storeId: input.storeId,
    },
  };
};

export const createCategoryInPostgres = async (input: {
  storeId: string;
  name: string;
  sortOrder: number;
}): Promise<CategoryWriteResult> => {
  const existing = await queryOne<{ id: string }>(
    `
      select id
      from product_categories
      where store_id = :storeId
        and name = :name
      limit 1
    `,
    {
      replacements: {
        storeId: input.storeId,
        name: input.name,
      },
    },
  );

  if (existing) {
    return { ok: false, error: "CONFLICT" };
  }

  await execute(
    `
      insert into product_categories (
        id,
        store_id,
        name,
        sort_order
      )
      values (
        :id,
        :storeId,
        :name,
        :sortOrder
      )
    `,
    {
      replacements: {
        id: randomUUID(),
        storeId: input.storeId,
        name: input.name,
        sortOrder: input.sortOrder,
      },
    },
  );

  return {
    ok: true,
    categories: await listCategoriesDirectFromPostgres(input.storeId),
  };
};

export const updateCategoryInPostgres = async (input: {
  storeId: string;
  id: string;
  name?: string;
  sortOrder?: number;
}): Promise<CategoryWriteResult> => {
  const target = await queryOne<{ id: string }>(
    `
      select id
      from product_categories
      where id = :id
        and store_id = :storeId
      limit 1
    `,
    {
      replacements: {
        id: input.id,
        storeId: input.storeId,
      },
    },
  );

  if (!target) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (input.name) {
    const dup = await queryOne<{ id: string }>(
      `
        select id
        from product_categories
        where store_id = :storeId
          and name = :name
        limit 1
      `,
      {
        replacements: {
          storeId: input.storeId,
          name: input.name,
        },
      },
    );

    if (dup && dup.id !== input.id) {
      return { ok: false, error: "CONFLICT" };
    }
  }

  const setClauses: string[] = [];
  const replacements: Record<string, unknown> = {
    id: input.id,
    storeId: input.storeId,
  };

  if (input.name !== undefined) {
    replacements.name = input.name;
    setClauses.push(`name = :name`);
  }

  if (input.sortOrder !== undefined) {
    replacements.sortOrder = input.sortOrder;
    setClauses.push(`sort_order = :sortOrder`);
  }

  if (setClauses.length > 0) {
    await execute(
      `
        update product_categories
        set ${setClauses.join(", ")}
        where id = :id
          and store_id = :storeId
      `,
      {
        replacements,
      },
    );
  }

  return {
    ok: true,
    categories: await listCategoriesDirectFromPostgres(input.storeId),
  };
};

export const deleteCategoryInPostgres = async (input: {
  storeId: string;
  id: string;
}): Promise<CategoryWriteResult> => {
  await execute(
    `
      delete from product_categories
      where id = :id
        and store_id = :storeId
    `,
    {
      replacements: input,
    },
  );

  return {
    ok: true,
    categories: await listCategoriesDirectFromPostgres(input.storeId),
  };
};

export const connectOnboardingChannelInPostgres = async (
  storeId: string,
  channel: "FACEBOOK" | "WHATSAPP",
): Promise<ChannelState> => {
  const now = new Date().toISOString();

  await runInTransaction(async (tx) => {
    if (channel === "FACEBOOK") {
      const existing = await queryOne<{ id: string }>(
        `
          select id
          from fb_connections
          where store_id = :storeId
          limit 1
        `,
        {
          transaction: tx,
          replacements: { storeId },
        },
      );

      if (existing) {
        await execute(
          `
            update fb_connections
            set
              status = 'CONNECTED',
              page_name = 'Demo Facebook Page',
              page_id = 'fb_demo_page',
              connected_at = :connectedAt
            where id = :id
              and store_id = :storeId
          `,
          {
            transaction: tx,
            replacements: {
              id: existing.id,
              storeId,
              connectedAt: now,
            },
          },
        );
        return;
      }

      await execute(
        `
          insert into fb_connections (
            id,
            store_id,
            status,
            page_name,
            page_id,
            connected_at
          )
          values (
            :id,
            :storeId,
            'CONNECTED',
            'Demo Facebook Page',
            'fb_demo_page',
            :connectedAt
          )
        `,
        {
          transaction: tx,
          replacements: {
            id: randomUUID(),
            storeId,
            connectedAt: now,
          },
        },
      );
      return;
    }

    const existing = await queryOne<{ id: string }>(
      `
        select id
        from wa_connections
        where store_id = :storeId
        limit 1
      `,
      {
        transaction: tx,
        replacements: { storeId },
      },
    );

    if (existing) {
      await execute(
        `
          update wa_connections
          set
            status = 'CONNECTED',
            phone_number = '+8562099999999',
            connected_at = :connectedAt
          where id = :id
            and store_id = :storeId
        `,
        {
          transaction: tx,
          replacements: {
            id: existing.id,
            storeId,
            connectedAt: now,
          },
        },
      );
      return;
    }

    await execute(
      `
        insert into wa_connections (
          id,
          store_id,
          status,
          phone_number,
          connected_at
        )
        values (
          :id,
          :storeId,
          'CONNECTED',
          '+8562099999999',
          :connectedAt
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: randomUUID(),
          storeId,
          connectedAt: now,
        },
      },
    );
  });

  return readStoreChannelStatusDirectFromPostgres(storeId);
};

export const listUnitsDirectWriteReadFromPostgres = listUnitsDirectFromPostgres;
export const listCategoriesDirectWriteReadFromPostgres = listCategoriesDirectFromPostgres;
