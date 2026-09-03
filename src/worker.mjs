import { failClosedAuthenticator } from "./auth/authenticators.mjs";
import { createHttpGateway } from "./gateway/http-gateway.mjs";
import { createSovereignPlatform } from "./platform/sovereign-platform.mjs";

// This is deliberately an in-memory alpha composition root. Cloudflare Worker
// globals are not durable storage; deployment must replace these repositories
// with the dedicated Neon/R2 adapters described in docs/V0.2-SERVICES-AND-STORAGE.md.
const platform = createSovereignPlatform();
const gateway = createHttpGateway({ platform, authenticate: failClosedAuthenticator });

export default {
  fetch(request) {
    return gateway.fetch(request);
  }
};
