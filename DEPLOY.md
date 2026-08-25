# Restaurant Growth Audit — deploy guide (single repo, no drift)

This is ONE self-contained project. The V3 competitor engine is built in
(`/api/places/competitors`). There is no second repo and no COMPETITOR_ENGINE_URL
to wire. Everything degrades gracefully — set what you have and ship.

## What you have (your 4 APIs) → what to set

| Your API      | Env var                | Powers                          |
|---------------|------------------------|---------------------------------|
| Places API    | GOOGLE_PLACES_API_KEY  | restaurant lookup, competitors, PageSpeed |
| Outscraper    | OUTSCRAPER_API_KEY     | Google reviews / sentiment sample |
| SocialCrawl   | SOCIALCRAWL_API_KEY    | social activity (IG/FB/TikTok)  |
| OpenAI        | AI_PROVIDER=openai + AI_API_KEY + AI_MODEL=gpt-4o | report prose + competitor semantic scoring |

With no OpenAI credit: leave the AI_* vars blank. The audit still runs — real
pillars, real reviews baseline, real social, real competitor NAMES from the
engine's deterministic path (labeled "Limited evidence"). When credit lands,
set the three AI_* vars and redeploy — full intelligence turns on, no code change.

## Deploy to a NEW repo + Vercel

1. Create a new empty GitHub repo (e.g. `restaurant-growth-audit`).
2. In this folder:
       git init
       git add -A
       git commit -m "Unified growth audit — engine built in, provider-agnostic AI"
       git branch -M main
       git remote add origin https://github.com/<you>/<newrepo>.git
       git push -u origin main
3. In Vercel: New Project → import that repo → add the env vars above → Deploy.
4. Set NEXT_PUBLIC_BASE_URL to the deployment URL after first deploy (optional
   but recommended so the built-in engine calls itself cleanly), then redeploy.

## Verify after deploy
Run one audit (e.g. BurgerBloc). You should see:
- five pillars with scores,
- Google rating + review baseline,
- social channels (with sane numbers — implausible cadence/engagement suppressed),
- a competitor section that lists the engine's set OR an honest "being generated"
  line — never a blank gap.

## What changed vs the old two-repo setup
- Competitor engine folded in as local modules (was a separate deployment) — kills the drift.
- One provider-agnostic AI client for both the report and the engine.
- Every section degrades honestly instead of vanishing on partial data.
- Firebase persistence is optional and non-fatal.
- No scoring math or engine tuning changed — same logic you validated.
