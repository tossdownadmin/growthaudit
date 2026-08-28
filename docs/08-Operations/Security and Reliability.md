---
title: Security and Reliability
tags: [growth-audit, operations, security, reliability]
status: maintained
---

# Security and Reliability

## Existing controls

- third-party credentials are accessed only in server modules
- public audit projection omits lead details
- API origin restriction can be enabled with `ALLOWED_ORIGINS`
- lead endpoint supports `LEAD_SUBMIT_SECRET`
- lead/persistence routes apply IP-based limits
- response headers include HSTS, nosniff, and strict-origin referrer policy
- website/provider phases use bounded timeouts and catch failures
- logs report key presence/length rather than secret values
- Firestore Admin is never imported into client components
- GA4 event dispatch is limited to anonymous audit-funnel state; lead PII is excluded

## Reliability model

The audit is designed as a partial-evidence system. Each provider phase returns a structured fallback, then evidence coverage communicates uncertainty. Persistence and CRM operations are deliberately secondary to report delivery.

## Known limitations and risks

### SSRF exposure

Website URLs originate from Google/customer input and are fetched server-side, including shallow competitor websites. There is no centralized private-network/IP-range denial layer documented in the current code.

### In-memory rate limiting

The limiter is per process/serverless instance and resets with cold starts or deployments. It is not a strong distributed abuse control.

### Origin semantics

Blank `ALLOWED_ORIGINS` currently permits all origins. This differs from the comment in `.env.example`.

### Diagnostic endpoint

`/api/social/check` is public and can initiate paid/provider probes. Raw mode exposes response-shape samples, though not the key.

### Stored lead data

Firestore audit documents store lead details alongside reports. Public projection is safe, but Firestore rules, retention, access logging, and deletion policy are infrastructure concerns outside this repository.

### Analytics consent and PII

The GA4 Measurement ID is public but analytics must remain optional. If visitors are subject to consent requirements, implement consent collection and Consent Mode before storing analytics cookies. Do not place lead or report identifiers in GA4 event data; see [[07-Integrations/GA4 Analytics|GA4 Analytics]].

### Lead-submit secret and browser flow

If `LEAD_SUBMIT_SECRET` is enabled, the current browser request does not add `x-submit-secret`; enabling it without an intermediary would block normal lead submissions.

### Dependency drift

`package.json` declares several dependencies as `latest`. The lockfile pins current resolutions, but automated updates can introduce breaking behavior.

### Long serverless work

The audit and competitor engine can each consume substantial time. The benchmark also self-calls the competitor route, so platform timeout, concurrency, and provider latency must be monitored.

## Operational recommendations

- restrict Google keys to the exact server APIs and deployment origins/IP model available
- protect or disable diagnostic provider probes in production
- add durable rate limiting for public paid endpoints
- validate outbound URLs against private/local network targets
- define Firestore retention/deletion and least-privilege access
- alert on provider failure rates, timeout rates, and low audit coverage
- pin dependency versions and choose one package manager

## Related notes

- [[08-Operations/Deployment|Deployment]]
- [[04-Modules/Platform Modules|Platform Modules]]
