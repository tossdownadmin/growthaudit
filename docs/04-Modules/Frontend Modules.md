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

Responsibilities:

- debounced Google Places autocomplete
- location selection and detail retrieval
- best-effort website/social discovery
- restaurant detail confirmation
- international phone input and lead validation
- progress-stage animation during the long audit request
- dual-stage lead submission using one `submissionId`
- report persistence and share URL handling
- anonymous GA4 funnel events; no lead PII is sent to analytics
- switching between landing, running, and report states
- conversion-first progress UI and sample-result proof before contact

Main state includes `query`, `suggestions`, `detail`, `loading`, `audit`, `error`, `auditStage`, `showLead`, and `shareUrl`.

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

The landing, audit-progress, and report shells use a consistent tossdown-branded header. The wordmark and a visible “Visit tossdown” action both link to `https://tossdown.com`; the report also places contextual CTA rows after major growth-engine and customer-voice sections, plus the final handoff CTA.

The entry flow shows four lightweight steps (`Find`, `Confirm`, `Audit`,
`Unlock`) and keeps the website-required validation explicit. The audit runs
before lead capture; when complete, a blurred real-report preview sits behind
the unlock form. GA4 and Clarity remain mounted at the root and are not removed
or renamed.

## `app/globals.css`

Tailwind CSS 4 entry point and application theme. Defines the light palette, Tossdown pink, semantic success/warning/danger colors, resilient typography, global sizing, selection colors, audit progress animation, and reusable premium-surface treatments.

## Contact and handoff policy

- The owner-facing call to action links to `https://tossdown.com`.
- Any displayed Tossdown email address uses `info@tossdown.com`.

## Related notes

- [[03-Workflows/Audit Workflow|Audit Workflow]]
- [[06-Data/Data Model|Data Model]]
