# API Endpoint Contract — Restaurant Growth Audit V1

All third-party calls run server-side.

## Internal routes

### `GET /api/places/autocomplete?input=<query>`
Google Places Autocomplete (New).

### `GET /api/places/details?placeId=<place id>`
Returns the selected restaurant, coordinates, Google website, rating/review count, category, price level, opening hours, and the small Google review sample.

### `GET /api/social/discover?...`
Best-effort public social-link discovery from the confirmed restaurant website.

### `POST /api/direct-audit`
Main audit route.

Runs:
1. target website HTML inspection
2. ordering ownership classification
3. public customer-path detection
4. analytics/pixel detection
5. PageSpeed mobile + desktop
6. SocialCrawl public social activity
7. Outscraper recent Google reviews + owner responses
8. lightweight Google Places local competitor benchmark
9. deterministic five-pillar Growth Engine Score
10. one OpenAI strategic interpretation

The independent provider phases run concurrently where practical.

### `POST /api/lead`
Existing best-effort lead capture. Not modified by the Growth Audit scoring work.

### `POST /api/audits`
Existing optional Firestore report persistence. Not modified by the Growth Audit scoring work.

### `GET /api/audits/[id]`
Existing public saved-report lookup.

## External providers

### Google Places
- `POST https://places.googleapis.com/v1/places:autocomplete`
- `GET https://places.googleapis.com/v1/places/{PLACE_ID}`
- `POST https://places.googleapis.com/v1/places:searchNearby`
- `POST https://places.googleapis.com/v1/places:searchText`

The benchmark uses searchNearby + searchText with a roughly 5 km location window.

### PageSpeed Insights
`GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed`

### Outscraper Google Maps Reviews
Current review adapter in `lib/reviewAudit.ts`.

Used only for the target restaurant.

### SocialCrawl
Current social adapter in `lib/social.ts`.

Used only for the target restaurant.

### Browserless
Optional website HTML fallback in `lib/audit.ts`.

### OpenAI Responses API
One interpretation call after deterministic evidence/scoring.

## Cost guardrail for competitive context

Competitors do NOT receive:
- Outscraper review pulls
- SocialCrawl calls
- PageSpeed runs

Only Google public business facts and a shallow public website ordering check are used.

## Result shape additions

`POST /api/direct-audit` now returns:

- `result.score`
- `result.coverage`
- `result.provisional`
- `result.sections[]` — five Growth Engine pillars
- `result.sectionByKey`
- `result.ordering`
- `result.paidMediaReadiness`
- `benchmark`
- existing `website`
- existing `reviews`
- existing `social`
- `interpretation`
