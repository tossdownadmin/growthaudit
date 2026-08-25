# Restaurant Growth Audit — Algorithm V1

## North star

Make restaurants smarter by showing whether the growth engine can:

ATTRACT → CONVERT → RETAIN → ENGAGE → MEASURE / GROW.

The deterministic layer owns facts and scores. The LLM interprets the evidence and ranks actions.

## Five weighted pillars

- Website + Ordering: 25
- Reputation + Local Presence: 25
- Customer Retention: 20
- Customer Engagement: 15
- Measurement + Growth: 15

Each pillar is normalized over evidence actually measured.

Overall evidence coverage is the weighted percentage of measurable signals. Coverage below 85% is provisional.

## Ordering classification

Public website order CTAs are classified:

- owned: ordering stays on restaurant domain/subdomain
- branded_direct: recognized restaurant ordering platform, not a marketplace
- mixed: direct/branded + marketplace choices
- marketplace: DoorDash/Uber Eats/Grubhub/etc. handoff
- unclear
- none

Marketplace ordering is not scored the same as owned/branded ordering.

## Local competitive benchmark

1. Use target coordinates + Google category.
2. Derive a concept query from specific Google primary type or strong public website concept terms.
3. Run Google Places Nearby Search and Text Search inside ~5 km.
4. Dedupe target/candidates.
5. Rank with:
   - primary/category overlap
   - targeted-search evidence
   - distance
   - rating/review proof
   - price match when available
6. Keep up to five likely alternatives.
7. Shallow-check ordering on the top three competitor websites.
8. Benchmark:
   - median rating
   - median review count
   - direct/branded ordering prevalence

No SocialCrawl, Outscraper or PageSpeed calls are made for competitors.

## Retention signals

Publicly detect:
- loyalty/rewards
- account/login
- email capture
- SMS capture
- WhatsApp
- branded app
- direct/branded ordering

Absence means "not detected publicly", not proof that internal CRM does not exist.

## Engagement signals

- SocialCrawl public posting recency/frequency/engagement
- Outscraper owner review responses
- negative-review response behavior

Followers are informational only.

## Measurement signals

Public HTML detection:
- GA4
- GTM
- Google Ads tags
- Meta Pixel
- TikTok Pixel
- supporting search-readiness signals

Do not claim private reporting quality.

## LLM job

The LLM receives:
- deterministic Growth Engine result
- target website/ordering/tracking evidence
- reviews
- social activity
- local benchmark

It returns:
- executive summary
- biggest growth leak
- 3 priorities
- paid-media readiness explanation
- competitor context
- pillar summaries
- review themes
- missing evidence
- confidence

It may interpret but must never contradict deterministic facts.

## Paid-media readiness

Ready only when the direct conversion, reputation, retention and measurement foundations are sufficiently strong.

Paid media is framed as fuel for a working engine, not a substitute for one.
