# Deploy to a brand-new Vercel project

## Fastest path

1. Create a new empty GitHub repository.
2. Put the contents of this deploy pack at the repository root.
3. Commit and push.
4. In Vercel, choose **Add New → Project** and import that repository.
5. Framework should be detected as **Next.js**.
6. Add environment variables from `.env.example`.
7. Deploy.

## Required environment variables for the useful V1

### Required immediately
- `GOOGLE_PLACES_API_KEY`
- `OPENAI_API_KEY`

### Required for full review response analysis
- `SERPAPI_API_KEY`

### Optional
- `DIRECT_AUDIT_AI_MODEL=gpt-5.6`

## Google Cloud

Enable in the same Google Cloud project:
- Places API (New)
- PageSpeed Insights API

The same API key can be used by the app if its restrictions allow both APIs.

For production:
- restrict the key to the APIs actually used
- never expose it in `NEXT_PUBLIC_*`

## Vercel routes

After deployment:

- `/` → audit UI
- `/direct-audit` → same audit UI
- `/api/places/autocomplete`
- `/api/places/details`
- `/api/direct-audit`
- `/api/direct-audit/reviews`

## Smoke test

1. Open `/`.
2. Search a restaurant.
3. Select the exact location.
4. Confirm website/socials.
5. Run audit.
6. Confirm:
   - Google website check appears
   - website health appears
   - PageSpeed results appear
   - AI relationship intelligence appears
7. If `SERPAPI_API_KEY` is configured:
   - report initially shows review collection pending
   - full review response/sentiment data appears after polling

## Important

Social-profile presence works in V1.
Actual Instagram/Facebook/TikTok posting frequency is intentionally not
fabricated. It remains an adapter/follow-up integration until a reliable public
post-data provider is selected.
