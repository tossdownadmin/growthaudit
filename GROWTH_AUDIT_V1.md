# Restaurant Growth Audit V1 — Test Build

This build reorganizes the existing working audit into a restaurant-owner Growth Engine diagnostic.

## What changed

### New deterministic Growth Engine Score
- Website + Ordering — 25
- Reputation + Local Presence — 25
- Customer Retention — 20
- Customer Engagement — 15
- Measurement + Growth — 15

Missing evidence remains unknown and lowers evidence coverage rather than becoming an automatic zero.

### Ordering ownership
The target website now classifies visible ordering as:
- owned
- branded/direct
- mixed
- marketplace
- unclear
- none

### Local competitive context
A lightweight Google Places benchmark is built automatically.
It does not ask the owner to pick competitors.

It compares:
- rating
- review volume
- public ordering posture

No paid review/social/PageSpeed provider calls are made for competitors.

### Report
The report now leads with:
1. Growth Engine Score
2. five owner-facing pillars
3. biggest growth leak + top priorities
4. website/ordering ownership
5. local competitive context
6. reviews
7. social
8. paid-media readiness
9. complete growth-engine map
10. technical evidence

## Existing integrations preserved

No intentional changes were made to:
- Outscraper
- SocialCrawl
- Browserless
- PageSpeed
- Google Places autocomplete/details
- lead/Firebase/GHL modules
- shareable report persistence

Firebase/GHL remain optional. Leave those env vars unset if you only want to test the audit.

## New files
- `lib/growthEngine.ts`
- `lib/competitorBenchmark.ts`

No new environment variables or paid providers are required for the Growth Audit change.
