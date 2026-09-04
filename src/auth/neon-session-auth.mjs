import { SovereignError } from "../platform/errors.mjs";

export function createNeonSessionAuthenticator({ baseUrl, fetchImpl = fetch }) {
  const normalizedBaseUrl = baseUrl?.replace(/\/$/, "") ?? null;

  return async function authenticate(request) {
    if (!normalizedBaseUrl) throw new SovereignError("auth_not_configured", "NEON_AUTH_BASE_URL is required.", { status: 503 });
    const cookie = request.headers.get("cookie");
    if (!cookie) throw new SovereignError("unauthorized", "Sign in to Project Sovereign.", { status: 401 });
    const origin = new URL(request.url).origin;

    const response = await fetchImpl(`${normalizedBaseUrl}/get-session`, {
      method: "GET",
      headers: { cookie, accept: "application/json", origin }
    });
    if (!response.ok) throw new SovereignError("unauthorized", "Sovereign authentication session is invalid or expired.", { status: 401 });

    const payload = await response.json();
    const sessionData = payload?.data ?? payload;
    const user = sessionData?.user ?? sessionData?.session?.user ?? null;
    const authSubject = user?.id ?? user?.userId ?? user?.user_id ?? null;
    if (!authSubject) throw new SovereignError("unauthorized", "Neon Auth did not return an authenticated user.", { status: 401 });

    return {
      authSubject,
      user,
      session: sessionData?.session ?? null,
      permissions: ["control_plane.use"]
    };
  };
}

export async function proxyNeonAuth(request, { baseUrl, fetchImpl = fetch }) {
  if (!baseUrl) throw new SovereignError("auth_not_configured", "NEON_AUTH_BASE_URL is required.", { status: 503 });
  const url = new URL(request.url);
  const suffix = url.pathname.replace(/^\/api\/auth/, "") || "/";
  const target = new URL(baseUrl.replace(/\/$/, "") + suffix);
  target.search = url.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const upstream = await fetchImpl(target.toString(), {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual"
  });

  const responseHeaders = new Headers(upstream.headers);
  rewriteSetCookieHeaders(upstream.headers, responseHeaders);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
}

function rewriteSetCookieHeaders(upstreamHeaders, responseHeaders) {
  const getSetCookie = upstreamHeaders.getSetCookie?.bind(upstreamHeaders);
  const cookies = getSetCookie ? getSetCookie() : splitCombinedSetCookie(upstreamHeaders.get("set-cookie"));
  if (!cookies.length) return;
  responseHeaders.delete("set-cookie");
  for (const cookie of cookies) responseHeaders.append("set-cookie", normalizeProxyCookie(cookie));
}

function normalizeProxyCookie(cookie) {
  return cookie
    .replace(/;\s*Domain=[^;]+/gi, "")
    .replace(/;\s*Path=[^;]+/gi, "; Path=/");
}

function splitCombinedSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=]+=[^;,]+)/g).map((item) => item.trim()).filter(Boolean);
}
