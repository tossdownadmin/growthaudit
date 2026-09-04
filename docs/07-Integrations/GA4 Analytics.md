---
title: GA4 Analytics
tags: [growth-audit, integrations, analytics, ga4]
status: maintained
source:
  - app/layout.tsx
  - components/google-analytics.tsx
  - lib/analytics.ts
  - app/page.tsx
---

# GA4 Analytics

## Purpose

GA4 measures aggregate visitor behaviour and the public audit funnel. It does not replace Firestore or GoHighLevel, which store reports and CRM contacts.

## Configuration

Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` to the GA4 web data-stream Measurement ID (`G-…`) in the relevant Vercel environments. It is a public browser identifier, not a secret. When it is absent or malformed, the application renders no Google tag and tracking calls are no-ops.

The tag is mounted once in the root layout using Next.js `Script` with the `afterInteractive` strategy. This avoids delaying page hydration while still collecting page views across the application.

## Funnel events

| Event | Trigger | Allowed parameters |
|---|---|---|
| `restaurant_selected` | Google Place details and asset discovery have loaded | `restaurant_category`, `has_google_website` |
| `audit_started` | a validated lead form starts the audit | `restaurant_category`, `has_website`, `social_profile_count` |
| `generate_lead` | the validated lead form is submitted | `restaurant_category` |
| `audit_completed` | the audit API returns successfully | `growth_score`, `evidence_coverage` |
| `report_shared` | a saved report receives its share URL | `growth_score` |

CTA links are external handoffs to tossdown.com and do not carry restaurant, report, or lead identifiers in their destination URL.

`generate_lead` is the primary conversion candidate. Mark it as a GA4 Key Event after GA4 receives it. `audit_completed` may also be marked when audit completion is a useful marketing outcome.

## Privacy boundary

Never send lead names, email addresses, phone numbers, full restaurant addresses, place IDs, report IDs, or URLs to GA4. Do not add them as event names, event parameters, user properties, UTM values, or page titles. Restaurant categories, booleans, score bands, and coverage bands are sufficient for funnel analysis.

> [!important]
> If the public audit is offered to visitors in jurisdictions requiring consent, deploy a compliant consent mechanism and configure Google Consent Mode before allowing analytics storage. Update the public privacy/cookie notice to disclose GA4.

## Verification

1. Deploy with `NEXT_PUBLIC_GA_MEASUREMENT_ID` configured.
2. Open the audit in an incognito window and use GA4 **Realtime** or **DebugView**.
3. Select a restaurant, submit a valid form, and allow the audit to finish.
4. Confirm the page view plus the funnel events above appear without PII.
5. In GA4 Admin, mark `generate_lead` as a Key Event.

## Related notes

- [[09-Reference/Environment Variables|Environment Variables]]
- [[08-Operations/Deployment|Deployment]]
- [[04-Modules/Frontend Modules|Frontend Modules]]
