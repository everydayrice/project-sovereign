# Connect ChatGPT to Sovereign

Sovereign is the only connection needed for its intelligence and continuity. GitHub,
Neon and R2 remain server-side implementation dependencies. This connection does not
require RICE Lightning or Queue.

## Release prerequisite

Apply reviewed migration `0006_mcp_oauth.sql` before deploying this change. It adds
OAuth client and grant tables; it does not migrate or delete existing knowledge.
No additional Worker, bucket, API key, or environment secret is required.

## Link your account

1. In ChatGPT on the web, open Settings → Security and login → Developer mode.
2. Open Plugins, select the plus button, and create a developer-mode app.
3. Name it **Sovereign**. Use `https://project-sovereign.ricecloud.workers.dev/mcp`.
4. Select OAuth with dynamic client registration. Leave static client credentials empty.
5. Sign in to Sovereign and approve the displayed workspace permissions.
6. Select Sovereign in a new ChatGPT conversation.

ChatGPT requires OAuth for this private connection. Do not choose No Authentication
or put a service credential in the URL. The server supports public OAuth clients
with S256 PKCE and exact registered HTTPS callbacks. Tokens expire in one hour;
refresh tokens rotate and the grant expires after 30 days. Reconnect after expiry.
Revoke a connection in Sovereign Command → Machine access.

Reference: https://developers.openai.com/api/docs/guides/developer-mode
Authentication: https://developers.openai.com/plugins/build/auth

## First acceptance prompt

> Use Sovereign. List my existing tasks and describe what context is actually available.
> Create a task titled "ChatGPT connection acceptance", check into it, and save a
> checkpoint saying "First ChatGPT session saved successfully", with next action
> "Verify this checkpoint in a fresh ChatGPT conversation". Return the task ID and
> persistence receipt. Do not create or approve canonical knowledge.

In a fresh conversation with Sovereign selected:

> Use Sovereign to find and resume "ChatGPT connection acceptance". Report its saved
> checkpoint and next action. Do not rely on this conversation's memory.

Only mark ChatGPT acceptance passed after this succeeds through the deployed server.
An empty workspace does not establish that historic RICE Command knowledge was imported.

## Verification evidence

- Official MCP JavaScript SDK connects, lists tools, pings, writes a checkpoint and
  resumes it using a second client, against the local server with test persistence.
- OAuth handler tests cover consent/CSRF, PKCE, exact callbacks, resource validation,
  code replay, refresh rotation and audience restrictions.
- `node scripts/oauth-sql-acceptance.mjs` produces rollback-only SQL using the actual
  store queries. Run on the isolated migrated Neon branch to verify expiry, replay,
  owner permissions, token rotation and revocation against PostgreSQL.
- Production account linking and real ChatGPT calls are separate acceptance gates.

The administrative JSON export deliberately excludes OAuth clients, code hashes,
refresh hashes and service tokens. Existing knowledge export behavior is unchanged.
