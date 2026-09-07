# Project Sovereign

Project Sovereign is a vendor-neutral persistent AI intelligence platform. It gives a person or organization a durable, portable intelligence and continuity layer that survives individual chats, models, agents, providers and devices.

**Status:** V0.2 alpha deployed; V1 implementation and acceptance in progress. Production uses the Neon snapshot bridge until migration 0004 is approved and the normalized runtime is deployed.
**First tenant:** RICE
**Architecture:** four core modules — COMMAND, INTELLIGENCE, CONTROL PLANE, CONTINUITY

Protocol is the platform compatibility/lifecycle contract rather than a peer module. Specialized workflow products such as Queue Tracker and Idea Tracker are external extensions, not Sovereign core.

RICE is the first user and alpha tester, but Sovereign is built independently and must not require RICE-specific companies, repositories, business hierarchies or AI providers.

Start with:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/NAMING.md`](docs/NAMING.md)
- [`docs/V1.md`](docs/V1.md)
- [`docs/EXTENSIONS.md`](docs/EXTENSIONS.md)

## V0.2 implementation foundation

The first working vertical slice is a provider-neutral Control Plane runtime:

- distinct Actor Instances for concurrent chats/runs, even under one provider/account/model;
- Traffic Session check-in, orientation, generic Resource Claims, collision evaluation, renewable leases, heartbeats, checkpoints, release and checkout;
- structured Task Capsule / checkpoint / handoff continuity across chat and coding surfaces;
- Command-governed extension scope grants and revocation;
- a basic authenticated Control Plane traffic board;
- a fail-closed production auth seam, plus a deterministic local test adapter.

The deployed alpha has Neon Auth, the RICE tenant, R2 uploads and durable snapshot persistence. This branch replaces operational snapshot authority with normalized Neon tables and adds PostgreSQL search and source-backed extractive Ask. The snapshot remains a rollback/parity mirror. See the cutover status and safeguards in [`docs/V1.md`](docs/V1.md); code in a branch is not evidence of production deployment.

Read the current implementation authority in this order:

1. [`docs/V0.1-FREEZE.md`](docs/V0.1-FREEZE.md)
2. [`docs/V0.2-AUDIT.md`](docs/V0.2-AUDIT.md)
3. [`docs/V0.2-CONTRACTS.md`](docs/V0.2-CONTRACTS.md)
4. [`docs/V0.2-SERVICES-AND-STORAGE.md`](docs/V0.2-SERVICES-AND-STORAGE.md)
5. [`docs/V0.2-NEXT.md`](docs/V0.2-NEXT.md)
6. [`docs/V0.2-PRODUCT-ALPHA.md`](docs/V0.2-PRODUCT-ALPHA.md)

Run local tests with `npm ci`, `npm run check`, and `npm run test:coverage`. Database acceptance tests require explicit disposable-branch configuration documented in [`docs/V1.md`](docs/V1.md). The existing production Worker is [project-sovereign.ricecloud.workers.dev](https://project-sovereign.ricecloud.workers.dev).
