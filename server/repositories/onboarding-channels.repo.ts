import "server-only";

import { randomUUID } from "node:crypto";

import { execute, queryOne } from "@/lib/db/query";
import { createPerfScope, timeDb } from "@/server/perf/perf";

export type ChannelStatus = "DISCONNECTED" | "CONNECTED" | "ERROR";
export type ChannelState = {
  facebook: ChannelStatus;
  whatsapp: ChannelStatus;
};

type ChannelStatusReadMode = "parallel" | "combined";

const getReadMode = (): ChannelStatusReadMode =>
  process.env.CHANNEL_STATUS_QUERY_MODE === "parallel" ? "parallel" : "combined";

async function readStoreChannelStatusParallel(storeId: string): Promise<ChannelState> {
  const [fb, wa] = await Promise.all([
    timeDb("onboarding.channels.repo.readFacebook", async () =>
      queryOne<{ status: ChannelStatus | null }>(
        `
          select status
          from fb_connections
          where store_id = :storeId
          limit 1
        `,
        {
          replacements: { storeId },
        },
      ),
    ),
    timeDb("onboarding.channels.repo.readWhatsapp", async () =>
      queryOne<{ status: ChannelStatus | null }>(
        `
          select status
          from wa_connections
          where store_id = :storeId
          limit 1
        `,
        {
          replacements: { storeId },
        },
      ),
    ),
  ]);

  return {
    facebook: fb?.status ?? "DISCONNECTED",
    whatsapp: wa?.status ?? "DISCONNECTED",
  };
}

async function readStoreChannelStatusCombined(storeId: string): Promise<ChannelState> {
  const row = await timeDb("onboarding.channels.repo.readCombined", async () =>
    queryOne<{
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
    ),
  );

  return {
    facebook: row?.facebook ?? "DISCONNECTED",
    whatsapp: row?.whatsapp ?? "DISCONNECTED",
  };
}

export async function readStoreChannelStatus(storeId: string): Promise<ChannelState> {
  const mode = getReadMode();
  const perf = createPerfScope(`onboarding.channels.repo.readStatus.${mode}`);

  try {
    if (mode === "combined") {
      return perf.step("combined", async () => readStoreChannelStatusCombined(storeId));
    }

    return perf.step("parallel", async () => readStoreChannelStatusParallel(storeId));
  } finally {
    perf.end();
  }
}

export async function upsertFacebookConnected(storeId: string, connectedAt: string) {
  const existing = await timeDb("onboarding.channels.repo.findFacebook", async () =>
    queryOne<{ id: string }>(
      `
        select id
        from fb_connections
        where store_id = :storeId
        limit 1
      `,
      {
        replacements: { storeId },
      },
    ),
  );

  if (existing) {
    await timeDb("onboarding.channels.repo.updateFacebook", async () =>
      execute(
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
          replacements: {
            id: existing.id,
            storeId,
            connectedAt,
          },
        },
      ),
    );
    return;
  }

  await timeDb("onboarding.channels.repo.insertFacebook", async () =>
    execute(
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
        replacements: {
          id: randomUUID(),
          storeId,
          connectedAt,
        },
      },
    ),
  );
}

export async function upsertWhatsappConnected(storeId: string, connectedAt: string) {
  const existing = await timeDb("onboarding.channels.repo.findWhatsapp", async () =>
    queryOne<{ id: string }>(
      `
        select id
        from wa_connections
        where store_id = :storeId
        limit 1
      `,
      {
        replacements: { storeId },
      },
    ),
  );

  if (existing) {
    await timeDb("onboarding.channels.repo.updateWhatsapp", async () =>
      execute(
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
          replacements: {
            id: existing.id,
            storeId,
            connectedAt,
          },
        },
      ),
    );
    return;
  }

  await timeDb("onboarding.channels.repo.insertWhatsapp", async () =>
    execute(
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
        replacements: {
          id: randomUUID(),
          storeId,
          connectedAt,
        },
      },
    ),
  );
}
