# VibeCard Release Runbook

This runbook separates a build that is technically releasable from a service
that is actually live. Do not label a release complete until every applicable
gate below has evidence.

## 1. Automated release gate

Use Node.js 24 or newer from the repository root:

```bash
npm ci
npm run release:check
npm run test:e2e --workspace=packages/web
```

The release gate covers Web type checking and production build, the portable
Core, self-hosted Server, managed reference gateway, SDK, storage adapter,
Mini Program cloud functions, the production Web entrypoint, and production
dependency advisories. Playwright separately covers desktop and mobile user
paths.

## 2. H5 / PWA production stack

Create a private deployment configuration and replace every placeholder:

```bash
cp deploy/.env.example deploy/.env
openssl rand -base64 32
docker compose -f deploy/docker-compose.yml up -d --build
curl http://127.0.0.1:8080/healthz
```

The H5 container serves the built PWA, stores public short-card projections,
and proxies `/api/v1/*` to the private Vibe Server container. The browser can
therefore use the public origin as its service address without exposing an
internal Docker hostname or sending the owner token cross-origin.

Before public traffic:

- Put the H5 port behind a TLS reverse proxy; never publish the raw Node port.
- Set a long random `VIBECARD_OWNER_TOKEN` and rotate any test token.
- Pin `CORS_ORIGIN` to the real HTTPS origin where direct Server access exists.
- Configure `MODERATION_API_URL` with a real fail-closed service before
  accepting stranger text. The Compose production process refuses startup
  while `REQUIRE_MODERATION=1` and the URL is missing.
- Configure `AI_PROVIDER` and server-side model credentials, or consciously
  ship the deterministic mock.
- Back up both Docker volumes and make a private `.vibe` export; restore it in
  a clean environment at least once.
- Monitor `/healthz`, process/container restarts, disk usage, 5xx rate, model
  failures, moderation failures, and rate-limit volume.
- Add an incident contact and rollback owner. A rollback starts with a private
  export, the previous image, and a verified health/public-Card check.

The repository does not claim ownership of `vibecard.io`; configure canonical
and Open Graph URLs only after the operator has selected and verified a domain.

## 3. WeChat Mini Program release

Follow [`PHYSICAL_DEVICE_VERIFICATION.md`](PHYSICAL_DEVICE_VERIFICATION.md).
The release remains incomplete until cloud functions and indexes are deployed
and a non-developer visitor opens a real share on a second device.

Required evidence:

- Cloud-function deployment versions and time
- Database collection/index screenshots
- DevTools compile result
- Owner-device and visitor-device test result
- Share/deep-link target owner ID
- Connection/contact unlock result
- Report/block result
- Now publish/archive/visitor-grounding result

## 4. Release record

Record for every release:

```text
Version / commit:
Environment:
Deployed at:
Deployed by:
Release-check result:
Dependency audit result:
H5 health URL and result:
Mini Program version:
Physical-device verifier and date:
Backup artifact and restore-test date:
Rollback owner:
Known limitations:
```
