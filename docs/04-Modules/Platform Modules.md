---
title: Platform Modules
tags: [growth-audit, modules, platform]
status: maintained
---

# Platform Modules

## `lib/http.ts`

Shared route utilities. `clientIp` reads standard proxy headers, `guard` converts rate-limit rejection into HTTP 429, and `bad` creates consistent JSON errors.

## `lib/ratelimit.ts`

In-memory fixed-window limiter keyed by client IP. It is best-effort server-instance protection. State is neither distributed nor durable, so limits can reset across serverless instances and deployments.

## `lib/debug.ts`

Structured console diagnostics with scope, message, optional details, error normalization, start timestamps, and elapsed-time formatting. Provider keys are not intentionally logged.

## `middleware.ts`

Applies only to `/api/:path*`. When `ALLOWED_ORIGINS` has entries, cross-origin requests must match one. Requests without `Origin` and allow-listed origins pass.

> [!note]
> Current behavior allows all origins when `ALLOWED_ORIGINS` is blank, despite the `.env.example` comment describing blank as same-origin-only.

## `next.config.mjs`

- enables React strict mode
- bundles `COMPETITOR_ENGINE.md` into `/api/places/competitors`
- sends `X-Content-Type-Options`, `Referrer-Policy`, and HSTS headers globally

## `vercel.json`

Declares the Next.js framework, `.next` output, clean URLs, and no trailing slash.

## `tsconfig.json`

Strict, no-emit TypeScript with bundler module resolution, Next.js plugin, React JSX transform, incremental metadata, and `@/*` mapped to the repository root.

## `postcss.config.mjs`

Configures the Tailwind CSS 4 PostCSS plugin.

## Related notes

- [[08-Operations/Security and Reliability|Security and Reliability]]
- [[08-Operations/Deployment|Deployment]]
