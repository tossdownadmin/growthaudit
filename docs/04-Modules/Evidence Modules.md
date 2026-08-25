---
title: Evidence Modules
tags: [growth-audit, modules, evidence, website]
status: maintained
---

# Evidence Modules

## `lib/audit.ts`

Primary website and PageSpeed evidence module.

### Website retrieval

`fetchWebsiteHtml` normalizes URLs, performs a direct fetch with browser-like headers, records timing/status/size/final URL, rejects unusable HTML, and optionally retries through Browserless. It returns structured failure evidence rather than throwing ordinary provider failures.

### PageSpeed

`fetchPageSpeed` runs a strategy-specific request and parses Lighthouse category scores, lab metrics, field-data status, SEO checks, final URL, and high-value opportunities. The orchestrator runs mobile and desktop simultaneously.

### HTML inspection

`inspectHtml` uses Cheerio and schema parsing to derive:

- title, description, canonical, Open Graph, headings, and structured data
- internal/external/nofollow links
- scripts, stylesheets, images, fonts, image formats, and lazy loading
- viewport and render-blocking indicators
- third-party hosts
- ordering paths and provider ownership
- menu/contact/reservation/customer paths
- loyalty, app, account, email, SMS, and WhatsApp signals
- GA4, GTM, Meta, Google Ads, and TikTok tracking
- public opening hours and Google-versus-site consistency

## `lib/auditEvidence.ts`

Small typed evidence vocabulary:

- `verified` — supported positive fact
- `opportunity` — supported gap with optional impact
- `unavailable` — evidence could not be measured
- `hasReliableEvidence` — excludes unavailable items

This supports explicit evidence states rather than overloaded booleans.

## `lib/scrape.ts`

Older lightweight website audit helpers. It extracts brand-matching social accounts, title/description/H1/canonical/schema, direct actions, analytics signals, and robots/sitemap presence. Current deep auditing is primarily implemented by `lib/audit.ts`; this module remains reusable compatibility logic.

## Related notes

- [[04-Modules/Core Scoring Modules|Core Scoring Modules]]
- [[07-Integrations/Integration Index|Integration Index]]
