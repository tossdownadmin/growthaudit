---
title: Frontend Modules
tags: [growth-audit, modules, frontend]
status: maintained
---

# Frontend Modules

## `app/layout.tsx`

Root application shell. It uses a resilient local system-font stack rather than build-time Google Font downloads, imports global CSS, declares product metadata, and provides the HTML/body wrapper. It mounts the optional GA4 tag once for all routes when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is configured. This keeps Vercel builds independent of Google Fonts availability.

## `app/page.tsx`

Main client-side controller and landing experience.

The public landing page follows the warm Tossdown conversion layout supplied in
the approved HTML reference: a cream background, minimal trust-led header,
two-column search hero with an illustrative score preview, proof-stat strip,
sample score cards, five audit-pillar cards, repeated final search CTA, and
contact footer. Both search surfaces use the same Google Places state and feed
the existing confirmation and audit workflow; the redesign does not alter
provider, analytics, Clarity, persistence, or lead-submission behavior.

Responsibilities:

- debounced Google Places autocomplete
- optional coarse browser geolocation for nearby-first restaurant suggestions
- a non-interactive location note beneath restaurant search
- location selection and detail retrieval
- best-effort website/social discovery
- restaurant detail confirmation
- international phone input and lead validation
- progress-stage animation during the long audit request
- separate asset-discovery and audit-running states so selection never flashes
  the audit screen before confirmation
- dual-stage lead submission using one `submissionId`
- report persistence and share URL handling
- anonymous GA4 funnel events; no lead PII is sent to analytics
- switching between landing, running, and report states
- conversion-first progress UI and sample-result proof before contact

Main state includes `query`, `suggestions`, `detail`, `loading`, `audit`, `error`, `auditStage`, `showLead`, and `shareUrl`.

Phone-country options store the ISO country code as their actual value while
displaying the calling code separately (for example, value `PK`, label
`PK +92`). This allows national Pakistani inputs with or without the leading
zero to normalize correctly through `libphonenumber-js`.

## `app/direct-audit/page.tsx`

Alternate route for the same audit experience. It preserves an explicit `/direct-audit` entry point without creating a second workflow.

## `app/r/[id]/page.tsx`

Dynamic server-rendered shared-report page.

- derives its base URL from forwarded request headers
- fetches `/api/audits/{id}` with `no-store`
- generates restaurant- and score-specific metadata
- returns Next.js `notFound()` when the record is unavailable
- is forced dynamic to avoid stale private/public report state

## `app/r/[id]/shared-report.tsx`

Small client bridge that renders the shared `Report`. Its reset action navigates to `/` so a viewer can run a new audit.

## `components/audit-report.tsx`

Complete report presentation layer. It translates normalized audit output into:

- Growth Engine score and channel framing
- five pillar bars and evidence coverage
- website/ordering relationship
- growth leaks and priorities
- competitor benchmark panel
- paid-media readiness
- growth-engine checklist/map
- social activity cards
- PageSpeed mobile/desktop cards
- technical website intelligence
- reviews, sentiment, themes, and response behavior

The component deliberately hides many provider plumbing failures from the owner-facing narrative while lower-level diagnostics remain in the returned audit object. Its visual system uses a dark editorial hero, high-contrast score treatment, consistent rounded evidence cards, and a direct Tossdown handoff.

## `components/google-analytics.tsx` and `lib/analytics.ts`

The root tag component validates the configured public Measurement ID and loads Google Analytics after application interactivity. The client helper provides typed, no-op-safe audit-funnel event dispatch. Event names and permitted non-PII parameters are defined in [[07-Integrations/GA4 Analytics|GA4 Analytics]].

## `components/microsoft-clarity.tsx`

The root Clarity component validates `NEXT_PUBLIC_CLARITY_PROJECT_ID` and loads Microsoft Clarity after application interactivity. It adds no custom user or CRM properties. See [[07-Integrations/Microsoft Clarity|Microsoft Clarity]].

## Header and calls to action

The landing, audit-progress, and report shells use a consistent tossdown-branded header. The header renders the supplied official Tossdown wordmark asset rather than a text approximation. The wordmark and a visible “Visit tossdown” action both link to `https://tossdown.com`; the report also places contextual CTA rows after major growth-engine and customer-voice sections, plus the final handoff CTA. Report CTAs use one high-contrast Tossdown pink-gradient treatment and consistent vertical spacing so they remain visually separate from audit evidence.

The public landing page keeps score cards and the five audit-pillar cards equal-height within each responsive row. On narrow screens, search controls, statistic grids, card grids, and footer contact links use explicit mobile layouts rather than relying on incidental wrapping.

Report CTA destinations are contextual:

- Strategy and growth-plan handoffs link to `https://tossdown.com/book-a-strategy-call`.
- Website and direct-ordering actions link to `https://tossdown.com/restaurant-website`.
- Customer voice and social actions link to `https://tossdown.com/restaurant-social-media`.
- Customer relationship and CRM actions link to `https://tossdown.com/crm-management`.

The entry flow shows three lightweight steps (`Find`, `Verify & audit`, `View
report`) and keeps website-required validation explicit. After URL verification,
the audit progress animation replaces the form content inside the same card.
When complete, a blurred real-report preview sits behind a form labelled as a
free-report handoff; the interface avoids lock/paywall language and explicitly
states that no payment is required. GA4 and Clarity remain mounted at the root
and are not removed or renamed.

## `app/globals.css`

Tailwind CSS 4 entry point and application theme. Defines the light palette, Tossdown pink, semantic success/warning/danger colors, resilient typography, global sizing, selection colors, audit progress animation, and reusable premium-surface treatments.

## Contact and handoff policy

- Owner-facing calls to action use the contextual destination documented above; the final “Talk to tossdown” handoff links to the strategy-call page.
- Any displayed Tossdown email address uses `info@tossdown.com`.

## Related notes

- [[03-Workflows/Audit Workflow|Audit Workflow]]
- [[06-Data/Data Model|Data Model]]
