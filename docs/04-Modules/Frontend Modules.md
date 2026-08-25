---
title: Frontend Modules
tags: [growth-audit, modules, frontend]
status: maintained
---

# Frontend Modules

## `app/layout.tsx`

Root application shell. It uses a resilient local system-font stack rather than build-time Google Font downloads, imports global CSS, declares product metadata, and provides the HTML/body wrapper. This keeps Vercel builds independent of Google Fonts availability.

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
- switching between landing, running, and report states

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

## `app/globals.css`

Tailwind CSS 4 entry point and application theme. Defines the light palette, Tossdown pink, semantic success/warning/danger colors, resilient typography, global sizing, selection colors, audit progress animation, and reusable premium-surface treatments.

## Contact and handoff policy

- The owner-facing call to action links to `https://tossdown.com`.
- Any displayed Tossdown email address uses `info@tossdown.com`.

## Related notes

- [[03-Workflows/Audit Workflow|Audit Workflow]]
- [[06-Data/Data Model|Data Model]]
