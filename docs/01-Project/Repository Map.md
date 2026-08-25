---
title: Repository Map
tags: [growth-audit, project, repository, moc]
status: maintained
---

# Repository Map

```text
growthaudit/
├── app/                    Next.js App Router pages and HTTP route handlers
│   ├── api/                Server-side API boundary
│   ├── direct-audit/       Alternate audit entry page
│   ├── r/[id]/             Dynamic public report page
│   ├── globals.css         Tailwind theme and global styles
│   ├── layout.tsx          Root metadata, fonts, and HTML shell
│   └── page.tsx            Main audit client experience
├── components/
│   └── audit-report.tsx    Full interactive report presentation
├── lib/                    Domain, provider, scoring, and infrastructure modules
├── docs/                   Obsidian-compatible project knowledge base
├── src/                    Historical/build specifications and deploy-pack notes
├── AGENTS.md               Repository-specific agent instruction
├── COMPETITOR_ENGINE.md    Canonical competitor reasoning policy
├── package.json            scripts and dependency declarations
├── package-lock.json       npm resolution lock
├── pnpm-lock.yaml          pnpm resolution lock
├── middleware.ts           API origin allow-list middleware
├── next.config.mjs         Next.js and response-header configuration
├── tsconfig.json           TypeScript compiler configuration
└── vercel.json             Vercel framework/output configuration
```

## Runtime ownership

| Area | Primary files | Documentation |
|---|---|---|
| User interface | `app/page.tsx`, `components/audit-report.tsx` | [[04-Modules/Frontend Modules|Frontend Modules]] |
| HTTP routes | `app/api/**/route.ts` | [[04-Modules/API Route Modules|API Route Modules]] |
| Website analysis | `lib/audit.ts`, `lib/scrape.ts`, `lib/auditEvidence.ts` | [[04-Modules/Evidence Modules|Evidence Modules]] |
| Growth scoring | `lib/growthEngine.ts`, `lib/reviewAudit.ts`, `lib/social.ts` | [[04-Modules/Core Scoring Modules|Core Scoring Modules]] |
| Competitors | `lib/competitor*.ts`, `lib/cuisine.ts` | [[04-Modules/Competitor Modules|Competitor Modules]] |
| Providers | `lib/google.ts`, `lib/aiClient.ts`, `lib/ghl.ts` | [[04-Modules/Provider Modules|Provider Modules]] |
| Persistence/security | `lib/firebase.ts`, `lib/http.ts`, `lib/ratelimit.ts`, `middleware.ts` | [[04-Modules/Platform Modules|Platform Modules]] |

## Existing specifications

- `GROWTH_AUDIT_V1.md` — high-level current build summary
- `COMPETITOR_ENGINE.md` — runtime-loaded competitor policy
- `DIRECT_AUDIT_ALGORITHM.md` — algorithm specification
- `RELEASE_GUARDRAILS.md` — release constraints
- `DEPLOY.md` — current unified deployment guide
- `src/PRODUCT_SPEC.md` and `src/API_ENDPOINTS.md` — product and route contracts
- `src/DEPLOY_VERCEL.md` — older deployment pack; consult cautiously because provider requirements differ from current code

## Related notes

- [[00-Home|Project Home]]
- [[08-Operations/Documentation Maintenance|Documentation Maintenance]]
