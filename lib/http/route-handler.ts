import { NextResponse } from "next/server";

import { buildRequestContext, type RequestContext } from "@/lib/http/request-context";
import {
  claimIdempotency,
  getIdempotencyKeyFromHeaders,
  hashRequestBody,
  type IdempotencyClaimResult,
} from "@/server/services/idempotency.service";

export type JsonRouteRequest = {
  requestContext: RequestContext;
  rawBody: string;
  body: unknown;
  idempotencyKey: string | null;
  requestHash: string;
};

export type JsonRouteRequestResult =
  | {
      ok: true;
      value: JsonRouteRequest;
    }
  | {
      ok: false;
      value: Omit<JsonRouteRequest, "body"> & { body: null };
      response: NextResponse;
    };

export const readJsonRouteRequest = async (
  request: Request,
): Promise<JsonRouteRequestResult> => {
  const requestContext = buildRequestContext(request);
  const rawBody = await request.text();
  const idempotencyKey = getIdempotencyKeyFromHeaders(request.headers);
  const requestHash = hashRequestBody(rawBody);

  try {
    return {
      ok: true,
      value: {
        requestContext,
        rawBody,
        body: rawBody ? JSON.parse(rawBody) : {},
        idempotencyKey,
        requestHash,
      },
    };
  } catch {
    return {
      ok: false,
      value: {
        requestContext,
        rawBody,
        body: null,
        idempotencyKey,
        requestHash,
      },
      response: NextResponse.json({ message: "รูปแบบ JSON ไม่ถูกต้อง" }, { status: 400 }),
    };
  }
};

export const toIdempotencyClaimResponse = (
  claim: IdempotencyClaimResult,
): NextResponse | null => {
  if (claim.kind === "replay") {
    return NextResponse.json(claim.body, { status: claim.statusCode });
  }

  if (claim.kind === "processing") {
    return NextResponse.json({ message: "คำขอนี้กำลังประมวลผลอยู่" }, { status: 409 });
  }

  if (claim.kind === "conflict") {
    return NextResponse.json(
      { message: "Idempotency-Key นี้ถูกใช้กับข้อมูลคำขออื่นแล้ว" },
      { status: 409 },
    );
  }

  return null;
};

type AcquiredIdempotencyClaim = Extract<
  IdempotencyClaimResult,
  { kind: "acquired" }
>;

export const claimIdempotencyForRoute = async (input: {
  storeId: string;
  action: string;
  idempotencyKey: string;
  requestHash: string;
  createdBy?: string | null;
}): Promise<
  | {
      ok: true;
      claim: AcquiredIdempotencyClaim;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> => {
  const claim = await claimIdempotency(input);
  if (claim.kind === "acquired") {
    return { ok: true, claim };
  }

  const response = toIdempotencyClaimResponse(claim);
  if (response) {
    return {
      ok: false,
      response,
    };
  }

  throw new Error("Unhandled idempotency claim state");
};
