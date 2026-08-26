# VibeCard client SDK

`packages/sdk` is a small TypeScript client for the stable `/api/v1` contract.
It works against `packages/server`, the managed gateway's account owner/public
routes, and any compatible implementation.

```ts
import { VibeClient } from '@vibecard/sdk';

const vibe = new VibeClient({ endpoint: 'https://vibe.example.com', ownerToken });
const card = await vibe.publicCard();
const reply = await vibe.visitorChat('visitor-123', '我们可以聊什么？');
```

Managed deployments use the same methods with explicit namespaces:

```ts
const vibe = new VibeClient({
  endpoint: 'https://cloud.example.com',
  namespace: { kind: 'managed', accountId, cardSlug },
  auth: { getToken: () => session.currentAccessToken() },
});
```

The authentication adapter is invoked immediately before each owner request,
so browser sessions and rotating credentials do not need to be copied into the
SDK. Static-token and adapter authentication are mutually exclusive, avoiding
an accidental long-lived-token fallback after session logout. Public Card,
visitor chat, and request methods never invoke the adapter or attach its token.

Owner and visitor examples are exported from
`packages/sdk/examples/client-flows.ts`. They publish a confirmed Now draft,
open the public Card, start a visitor session, submit and summarize a specific
request, create an owner contact method, connect with explicit contact
selection, and export a private archive. The same flows execute against real
self-hosted and managed instances in the integration suite.

The SDK exposes `VibeCard`, `Memory`, and `ConnectionRequest`-level operations
only. Successful responses are schema-checked and projected onto canonical
allowlists; server-added provider, database, contact, or raw fields do not leak
through public methods. API failures preserve HTTP status, stable error code,
and `Retry-After`. Private exports must validate as portable `.vibe` archives
and reject implementation-specific fields. It includes the complete
owner-confirmed Now lifecycle and does not expose provider-specific prompts,
database/ORM records, or credentials beyond the caller-supplied bearer token. The package is licensed
under AGPL-3.0-only like the open client.
