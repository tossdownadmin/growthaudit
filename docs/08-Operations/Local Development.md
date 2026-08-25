---
title: Local Development
tags: [growth-audit, operations, local-development]
status: maintained
---

# Local Development

## Prerequisites

- a current Node.js version compatible with Next.js 16
- npm, using the committed `package-lock.json`
- Google Cloud key for a functional restaurant-search flow
- optional provider accounts for complete evidence

## Install and configure

```bash
git switch feature/my-update
npm ci
cp .env.example .env.local
```

Populate at least:

```dotenv
GOOGLE_PLACES_API_KEY=your_server_side_key
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

For richer evidence, add Outscraper, SocialCrawl, and an AI provider. See [[09-Reference/Environment Variables|Environment Variables]].

## Start

```bash
npm run dev
```

Open `http://localhost:3000`.

## Quality commands

```bash
npm run typecheck
npm run build
npm run start
```

`npm run start` serves an existing production build. `npm run build` creates `.next` and should precede it.

## Smoke test

1. Search for a known restaurant.
2. Select the exact location and confirm populated Google fields.
3. Check discovered social profiles.
4. submit a valid lead.
5. confirm that the audit advances through progress states.
6. inspect five pillars, ordering status, reviews, social, competitors, readiness, and technical evidence.
7. inspect `diagnostics` in the network response for degraded providers.
8. if Firebase is configured, open the generated `/r/{id}` link in a private window and verify that lead data is absent.

## Package-manager note

Both `package-lock.json` and `pnpm-lock.yaml` exist. Use one canonical package manager per change to avoid resolution drift; current scripts and deployment guidance assume npm.

## Related notes

- [[08-Operations/Deployment|Deployment]]
- [[08-Operations/Security and Reliability|Security and Reliability]]
