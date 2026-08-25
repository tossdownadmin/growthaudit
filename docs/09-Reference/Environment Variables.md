---
title: Environment Variables
tags: [growth-audit, reference, configuration]
status: maintained
---

# Environment Variables

## Core evidence

| Variable | Required | Used by | Purpose |
|---|---:|---|---|
| `GOOGLE_PLACES_API_KEY` | Yes for core flow | Places routes, PageSpeed, benchmarks | Google Places (New) and PageSpeed key |
| `GOOGLE_MAPS_API_KEY` | Alias only | `lib/google.ts` | Compatibility alias for competitor Google wrapper |
| `OUTSCRAPER_API_KEY` | No | `lib/reviewAudit.ts` | recent reviews and owner responses |
| `SOCIALCRAWL_API_KEY` | No | `lib/social.ts`, social diagnostics | social profile/post evidence |
| `SERPAPI_API_KEY` | No | `lib/social.ts` | Google-result discovery for a missing website and official social profiles |
| `BROWSERLESS_TOKEN` | No | `lib/audit.ts` | website HTML fallback |

## AI

| Variable | Required | Purpose |
|---|---:|---|
| `AI_PROVIDER` | No | `openai` or `anthropic` |
| `AI_API_KEY` | No | preferred provider-neutral credential |
| `AI_MODEL` | No | preferred provider-neutral model name |
| `OPENAI_API_KEY` | No | OpenAI compatibility credential and auto-provider signal |
| `ANTHROPIC_API_KEY` | No | Anthropic compatibility credential |
| `DIRECT_AUDIT_AI_MODEL` | No | legacy OpenAI model override when `AI_MODEL` is absent |

Precedence is documented in [[04-Modules/Provider Modules|Provider Modules]]. With no working AI configuration, deterministic fallbacks remain functional.

## Internal URLs and routing

| Variable | Required | Purpose |
|---|---:|---|
| `NEXT_PUBLIC_BASE_URL` | Recommended | canonical deployment origin, report URLs, internal competitor call |
| `COMPETITOR_ENGINE_URL` | No | override to an external competitor engine |
| `VERCEL_URL` | Automatic on Vercel | fallback origin for internal competitor call |
| `ALLOWED_ORIGINS` | No | comma-separated API origin allow-list; blank currently allows all |

Although `NEXT_PUBLIC_BASE_URL` is public by naming convention, it must contain only an origin and never a credential.

## Firestore

All three are required together to enable persistence:

| Variable | Purpose |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase project |
| `FIREBASE_CLIENT_EMAIL` | Admin service-account email |
| `FIREBASE_PRIVATE_KEY` | Admin private key; escaped `\n` is restored at runtime |

## Lead capture

| Variable | Required | Purpose |
|---|---:|---|
| `GHL_PIT_TOKEN` | No | GoHighLevel private integration token |
| `GHL_LOCATION_ID` | No | GoHighLevel location |
| `LEAD_WEBHOOK_URL` | No | generic JSON lead webhook |
| `LEAD_SUBMIT_SECRET` | No | requires `x-submit-secret`; incompatible with current direct browser call unless mediated |

## Example local configuration

```dotenv
GOOGLE_PLACES_API_KEY=
OUTSCRAPER_API_KEY=
SOCIALCRAWL_API_KEY=
SERPAPI_API_KEY=

AI_PROVIDER=openai
AI_API_KEY=
AI_MODEL=gpt-4o

NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

> [!danger]
> Never commit `.env.local`, provider credentials, Firebase private keys, webhook secrets, or CRM tokens.

## Documentation drift

`.env.example` does not currently list every compatibility/optional variable documented here. Runtime code and this catalogue are the more complete references.

## Related notes

- [[07-Integrations/Integration Index|Integration Index]]
- [[08-Operations/Local Development|Local Development]]
