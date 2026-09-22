---
title: Meta Pixel
tags: [growth-audit, integrations, analytics, meta]
status: maintained
source:
  - app/layout.tsx
---

# Meta Pixel

## Repository-owned behavior

The root layout hardcodes Meta Pixel ID `2061786917743035`. The pixel library
loads with Next.js `Script` using `lazyOnload`. Repository code explicitly
initializes the pixel and sends only `PageView`. A no-script image also sends a
`PageView` when JavaScript is unavailable.

The repository does not explicitly send `Lead`, `SubscribedButtonClick`, or any
other Meta event, and it contains no Conversions API implementation.

## Externally configured behavior

Meta Test Events was observed receiving `Lead` and repeated
`SubscribedButtonClick` events on the production domain on 2026-09-22. Those
events are not defined in this repository. They are most likely created by
Meta's Event Setup Tool or automatic event detection, but the exact rule and
owner must be verified in Events Manager.

An observed Meta `Lead` proves that Meta received an event named `Lead`; it does
not, by itself, prove Firestore persistence, webhook delivery, GoHighLevel
upsert, or even successful `/api/lead` completion.

## Verification contract

Use Meta Test Events with a preserved browser Network log.

1. A page load should produce `PageView`.
2. Invalid lead-form input must not produce `Lead`.
3. A valid submission should produce exactly one intended `Lead`.
4. Expand the event and record its event source, URL, action source, parameters,
   timestamp, and connection method.
5. Match the event to `/api/audits`, `/api/lead`, Firestore, webhook, and GHL
   outcomes from the same test.
6. Inspect Event Setup Tool and automatic-event settings after any UI or button
   copy change because selector-based rules can silently stop or misfire.

## Privacy

Do not send name, email, phone, full address, place ID, report ID, or CRM ID as
Meta event parameters. Any future server-side event design must define lawful
consent, data minimization, deduplication, and retention before implementation.

## Related notes

- [[01-Project/Engineering Handover|Engineering Handover]]
- [[07-Integrations/GA4 Analytics|GA4 Analytics]]
- [[07-Integrations/Microsoft Clarity|Microsoft Clarity]]
- [[08-Operations/Security and Reliability|Security and Reliability]]
