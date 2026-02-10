import "server-only";

import { createPerfScope, timePerf } from "@/server/perf/perf";
import {
  readStoreChannelStatus,
  upsertFacebookConnected,
  upsertWhatsappConnected,
  type ChannelState,
} from "@/server/repositories/onboarding-channels.repo";

export async function getOnboardingChannelStatus(storeId: string): Promise<ChannelState> {
  return timePerf("onboarding.channels.service.getStatus.total", async () =>
    readStoreChannelStatus(storeId),
  );
}

export async function connectOnboardingChannel(
  storeId: string,
  channel: "FACEBOOK" | "WHATSAPP",
): Promise<ChannelState> {
  return timePerf("onboarding.channels.service.connect.total", async () => {
    const scope = createPerfScope("onboarding.channels.service.connect");

    try {
      const now = new Date().toISOString();

      await scope.step("repo.upsertConnection", async () => {
        if (channel === "FACEBOOK") {
          await upsertFacebookConnected(storeId, now);
          return;
        }

        await upsertWhatsappConnected(storeId, now);
      });

      return scope.step("repo.readStatus", async () => readStoreChannelStatus(storeId));
    } finally {
      scope.end();
    }
  });
}
