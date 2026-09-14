# Connect ChatGPT to Sovereign

Sovereign is the only connection needed for its intelligence and continuity. GitHub,
Neon and R2 remain server-side implementation dependencies. This connection does not
require RICE Lightning or Queue.

## Deployment prerequisites

For a new deployment, apply reviewed migrations through `0007_extension_grant_freshness.sql`.
Migration 0006 adds OAuth client and grant tables; 0007 preserves extension-grant
freshness metadata. Both are applied in the existing production deployment as of
September 14, 2026.
No additional Worker, bucket, API key, or environment secret is required.

## Link your account

1. In ChatGPT on the web, open Settings → Security and login → Developer mode.
2. Open Plugins, select the plus button, and create a developer-mode app.
3. Name it **Project Sovereign**. Use `https://project-sovereign.ricecloud.workers.dev/mcp`.
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
- Production account linking, task save/checkpoint and retrieval in a fresh ChatGPT
  conversation passed September 14, 2026. See [acceptance evidence](V1-ACCEPTANCE.md).

The administrative JSON export deliberately excludes OAuth clients, code hashes,
refresh hashes and service tokens. Existing knowledge export behavior is unchanged.

## Owner, user and client

The person signing in is a Sovereign user. A workspace owner can also administer
that workspace. ChatGPT is the OAuth client receiving the permissions granted at
consent. Connecting ChatGPT does not create another product administrator or require
a fresh personal email. Use the Sovereign account that holds the intended workspace.
Tenant display names do not make RICE Lightning a runtime dependency.

## Cancellation and expired consent

Cancel returns a readable recovery page. If consent expires, start a fresh connection
attempt through ChatGPT; refreshing a completed or expired authorization submission
is not a new consent flow. The deployed consent page preserves same-origin headers
while enforcing Origin and CSRF validation. Do not disable these checks to retry.

## After acceptance

Use the [working routine](WORKING-ROUTINE.md) to resume existing work and save progress.
A saved task/checkpoint is durable Continuity; approved Canonical Intelligence follows
its separate proposal/review policy.
