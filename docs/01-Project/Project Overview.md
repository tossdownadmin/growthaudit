---
title: Project Overview
tags: [growth-audit, project, product]
status: maintained
---

# Project Overview

## Purpose

Growth Audit is a lead-generation and diagnostic product for North American restaurant owners and operators. It converts publicly observable business signals into an owner-friendly assessment of where a restaurant attracts customers successfully and where orders, customer relationships, or repeat visits may leak.

## User journey

1. Search for a restaurant using Google Places.
2. Select the exact business location.
3. Review the website and automatically discovered social profiles.
4. provide lead details to unlock the audit.
5. Wait while independent evidence providers run concurrently.
6. Review the Growth Engine Score, evidence, priorities, and paid-media readiness.
7. Optionally receive a persistent shareable report URL when Firebase is enabled.

## Growth Engine model

| Pillar | Weight | Owner question |
|---|---:|---|
| Website + Ordering | 25 | Can customers easily buy from the restaurant directly? |
| Reputation + Local Presence | 25 | Does the restaurant win trust against nearby alternatives? |
| Customer Retention | 20 | Can the first transaction become another visit? |
| Customer Engagement | 15 | Is the restaurant visibly staying connected? |
| Measurement + Growth | 15 | Is there enough measurement foundation to scale intelligently? |

The score is deterministic. Unknown signals reduce evidence coverage instead of becoming automatic zeroes. Coverage below 85% makes the result provisional.

## Principal outputs

- Overall score, coverage, and provisional status
- Five weighted pillar scores
- Ordering ownership classification
- Biggest growth leak and three prioritized actions
- Nearby competitive context
- Review and owner-response analysis
- Social activity and engagement evidence
- Paid-media readiness status
- Technical website and PageSpeed evidence
- Diagnostics indicating which providers succeeded or degraded

## Ordering classifications

`owned`, `branded_direct`, `mixed`, `marketplace`, `unclear`, or `none`.

Marketplace fulfillment is treated differently from an owned or branded-direct relationship because the restaurant receives the transaction while owning less of the customer path.

## Product boundaries

> [!important]
> The system analyzes public evidence. It does not prove the absence of private CRM, analytics, loyalty, advertising, or operational practices.

- Competitor analysis is contextual, not the core score.
- The system does not run paid review, social, or PageSpeed calls on competitors.
- AI interprets deterministic results but is not allowed to recalculate them.
- Firebase, GoHighLevel, Browserless, DataForSEO, and AI are optional.
- Google Places is necessary for the primary search and restaurant identity flow.

## Related notes

- [[03-Workflows/Audit Workflow|Audit Workflow]]
- [[04-Modules/Core Scoring Modules|Core Scoring Modules]]
- [[09-Reference/Glossary|Glossary]]
