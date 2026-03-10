export type HeaderReader = Pick<Headers, "get">;

export type RequestContext = {
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

const readHeader = (
  headers: HeaderReader | null | undefined,
  name: string,
): string | null => {
  const value = headers?.get(name)?.trim();
  return value || null;
};

export const getRequestIdFromHeaders = (
  headers: HeaderReader | null | undefined,
): string | null =>
  readHeader(headers, "x-request-id") ??
  readHeader(headers, "x-correlation-id");

export const getIpAddressFromHeaders = (
  headers: HeaderReader | null | undefined,
): string | null => {
  const forwarded = readHeader(headers, "x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return readHeader(headers, "x-real-ip");
};

export const buildRequestContext = (
  source: { headers: HeaderReader } | HeaderReader | null | undefined,
): RequestContext => {
  const headers = source
    ? "headers" in source
      ? source.headers
      : source
    : null;

  return {
    requestId: getRequestIdFromHeaders(headers),
    ipAddress: getIpAddressFromHeaders(headers),
    userAgent: readHeader(headers, "user-agent"),
  };
};
