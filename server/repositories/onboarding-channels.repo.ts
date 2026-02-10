import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { createPerfScope, timeDb } from "@/server/perf/perf";
import { fbConnections, waConnections } from "@/lib/db/schema";

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
      db
        .select({ status: fbConnections.status })
        .from(fbConnections)
        .where(eq(fbConnections.storeId, storeId))
        .limit(1),
    ),
    timeDb("onboarding.channels.repo.readWhatsapp", async () =>
      db
        .select({ status: waConnections.status })
        .from(waConnections)
        .where(eq(waConnections.storeId, storeId))
        .limit(1),
    ),
  ]);

  return {
    facebook: fb[0]?.status ?? "DISCONNECTED",
    whatsapp: wa[0]?.status ?? "DISCONNECTED",
  };
}

async function readStoreChannelStatusCombined(storeId: string): Promise<ChannelState> {
  const [row] = await timeDb("onboarding.channels.repo.readCombined", async () =>
    db
      .select({
        facebook: sql<ChannelStatus>`coalesce((select status from fb_connections where store_id = ${storeId} limit 1), 'DISCONNECTED')`,
        whatsapp: sql<ChannelStatus>`coalesce((select status from wa_connections where store_id = ${storeId} limit 1), 'DISCONNECTED')`,
      })
      .from(sql`(select 1) as probe`)
      .limit(1),
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
  const [existing] = await timeDb("onboarding.channels.repo.findFacebook", async () =>
    db
      .select({ id: fbConnections.id })
      .from(fbConnections)
      .where(eq(fbConnections.storeId, storeId))
      .limit(1),
  );

  if (existing) {
    await timeDb("onboarding.channels.repo.updateFacebook", async () =>
      db
        .update(fbConnections)
        .set({
          status: "CONNECTED",
          pageName: "Demo Facebook Page",
          pageId: "fb_demo_page",
          connectedAt,
        })
        .where(and(eq(fbConnections.id, existing.id), eq(fbConnections.storeId, storeId))),
    );
    return;
  }

  await timeDb("onboarding.channels.repo.insertFacebook", async () =>
    db.insert(fbConnections).values({
      storeId,
      status: "CONNECTED",
      pageName: "Demo Facebook Page",
      pageId: "fb_demo_page",
      connectedAt,
    }),
  );
}

export async function upsertWhatsappConnected(storeId: string, connectedAt: string) {
  const [existing] = await timeDb("onboarding.channels.repo.findWhatsapp", async () =>
    db
      .select({ id: waConnections.id })
      .from(waConnections)
      .where(eq(waConnections.storeId, storeId))
      .limit(1),
  );

  if (existing) {
    await timeDb("onboarding.channels.repo.updateWhatsapp", async () =>
      db
        .update(waConnections)
        .set({
          status: "CONNECTED",
          phoneNumber: "+8562099999999",
          connectedAt,
        })
        .where(and(eq(waConnections.id, existing.id), eq(waConnections.storeId, storeId))),
    );
    return;
  }

  await timeDb("onboarding.channels.repo.insertWhatsapp", async () =>
    db.insert(waConnections).values({
      storeId,
      status: "CONNECTED",
      phoneNumber: "+8562099999999",
      connectedAt,
    }),
  );
}
