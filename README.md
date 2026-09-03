# Project Sovereign

Project Sovereign is a vendor-neutral persistent AI intelligence platform. It gives a person or organization a durable, portable intelligence and continuity layer that survives individual chats, models, agents, providers and devices.

**Status:** V0.2 product-alpha foundation (in-memory; deployment remains blocked on dedicated infrastructure)
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

The current product-alpha extension adds a real public/product shell (which is deliberately honest while Neon Auth is unconfigured), tenant-contained workspaces, source lifecycle and upload metadata, initialization coverage, versioned Canonical Intelligence change sets/checkpoints/reverts, and non-destructive Trust Recovery. It does not claim real sign-up, external OAuth, R2 object writes, Neon persistence, or deployment before the dedicated resources are configured and verified.

Read the current implementation authority in this order:

1. [`docs/V0.1-FREEZE.md`](docs/V0.1-FREEZE.md)
2. [`docs/V0.2-AUDIT.md`](docs/V0.2-AUDIT.md)
3. [`docs/V0.2-CONTRACTS.md`](docs/V0.2-CONTRACTS.md)
4. [`docs/V0.2-SERVICES-AND-STORAGE.md`](docs/V0.2-SERVICES-AND-STORAGE.md)
5. [`docs/V0.2-NEXT.md`](docs/V0.2-NEXT.md)
6. [`docs/V0.2-PRODUCT-ALPHA.md`](docs/V0.2-PRODUCT-ALPHA.md)

Run the in-memory alpha tests with `npm test`. This is not yet a deployed or persistent runtime: the dedicated Neon Auth, Neon database, R2 adapter, and Worker bindings must be connected before deployment.
