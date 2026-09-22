---
title: Microsoft Clarity
tags: [growth-audit, integrations, analytics, clarity]
status: maintained
source:
  - app/layout.tsx
  - components/microsoft-clarity.tsx
---

# Microsoft Clarity

## Purpose

Microsoft Clarity provides privacy-aware behavioral diagnostics such as session recordings, heatmaps, and interaction patterns for the audit experience. It complements [[07-Integrations/GA4 Analytics|GA4]], which measures the aggregate funnel.

## Configuration

Set `NEXT_PUBLIC_CLARITY_PROJECT_ID` to the Clarity project ID (`wrhaf3hh74`)
and set `NEXT_PUBLIC_ENABLE_CLARITY=true` in each Vercel environment where
recording is intended. The project ID is a public browser identifier, not a
secret. If the ID is absent/malformed or the enable flag is not exactly `true`,
no Clarity script is rendered.

The script is mounted once in the root layout with Next.js `Script` using
`lazyOnload`, so it does not block initial rendering.

## Privacy

Clarity masks sensitive content by default, but the audit must still avoid rendering lead details in owner-facing report pages. Do not send names, email addresses, phone numbers, or CRM identifiers as custom Clarity data. Review Clarity masking and consent settings for the jurisdictions where the audit is marketed.

## Verification

1. Add `NEXT_PUBLIC_CLARITY_PROJECT_ID=wrhaf3hh74` to the target Vercel environment.
2. Add `NEXT_PUBLIC_ENABLE_CLARITY=true` to the same environment.
3. Redeploy because `NEXT_PUBLIC_` values are embedded at build time.
4. Open the deployed audit and confirm the Clarity network request in DevTools.
5. After Clarity processing begins, verify the session appears in the Clarity project.

## Related notes

- [[07-Integrations/GA4 Analytics|GA4 Analytics]]
- [[09-Reference/Environment Variables|Environment Variables]]
- [[04-Modules/Frontend Modules|Frontend Modules]]
