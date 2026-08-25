---
title: Provider Modules
tags: [growth-audit, modules, providers]
status: maintained
---

# Provider Modules

## `lib/aiClient.ts`

Provider-agnostic AI adapter.

Configuration precedence:

1. `AI_PROVIDER`, `AI_API_KEY`, and `AI_MODEL`
2. provider-specific `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
3. compatibility model `DIRECT_AUDIT_AI_MODEL`
4. default OpenAI `gpt-4o` or Anthropic `claude-3-5-sonnet-latest`

`callModel` returns text; `callJson` requests and loosely parses JSON. Network errors, invalid responses, and timeouts return `{ok:false}` instead of throwing. OpenAI uses Chat Completions; Anthropic uses Messages.

## `lib/google.ts`

Thin server-side wrappers for Google Places `GET` and `POST` calls. They use `GOOGLE_PLACES_API_KEY` or the `GOOGLE_MAPS_API_KEY` alias, send field masks, return parsed JSON, and throw provider error details for callers to handle.

## `lib/firebase.ts`

Lazy Firebase Admin singleton. `firebaseConfigured` requires project ID, client email, and private key. `db` initializes one certified Admin app, restores escaped newlines in the key, creates Firestore, and enables ignored undefined properties.

## `lib/ghl.ts`

GoHighLevel lead adapter.

- validates that private integration token and location ID exist
- normalizes email, phone, and name fields
- upserts a contact through LeadConnector
- attaches audit/source metadata where supported
- returns `{ok,error}` without exposing credentials
- `buildTopGaps` converts prioritized report actions into a compact CRM value

## Provider logic implemented elsewhere

- Outscraper — `lib/reviewAudit.ts`
- SocialCrawl and DataForSEO — `lib/social.ts`
- PageSpeed and Browserless — `lib/audit.ts`
- Google Places direct route adapters — `app/api/places/**`

## Related notes

- [[07-Integrations/Integration Index|Integration Index]]
- [[09-Reference/Environment Variables|Environment Variables]]
