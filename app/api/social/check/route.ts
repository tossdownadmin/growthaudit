import { NextRequest, NextResponse } from 'next/server'
import { auditSocialProfiles, extractSocialLinks, scoreSocial, type DiscoveredSocials } from '@/lib/social'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * SocialCrawl diagnostics endpoint.
 *
 * Hit this directly on the deployed site to isolate the social pipeline from
 * the full audit. It NEVER returns the API key — only presence + length.
 *
 * Examples:
 *   /api/social/check                         -> key presence only
 *   /api/social/check?instagram=chipotle      -> live SocialCrawl probe for one handle
 *   /api/social/check?url=https://burgerbloc.ca  -> discover links from a site, then probe
 */
export async function GET(req: NextRequest) {
  const raw = process.env.SOCIALCRAWL_API_KEY
  const key = (raw || '').trim()
  const params = req.nextUrl.searchParams

  const keyStatus = {
    keyDefined: raw !== undefined,
    keyPresent: key.length > 0,
    keyLength: key.length,
    base: 'https://www.socialcrawl.dev/v1',
  }

  // Build the profiles to probe, either from explicit params or by discovering
  // them from a supplied website URL.
  let discovered: DiscoveredSocials = {}
  const explicit: DiscoveredSocials = {}
  for (const platform of ['instagram', 'facebook', 'tiktok', 'youtube', 'twitter'] as const) {
    const value = params.get(platform)
    if (value) explicit[platform] = value
  }

  const url = params.get('url')
  if (url) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; DirectAuditBot/1.0)' }, cache: 'no-store' })
      const html = (await res.text()).slice(0, 1500000)
      discovered = extractSocialLinks(html, url)
    } catch (error: any) {
      return NextResponse.json({ keyStatus, discoverError: error?.message || 'Failed to fetch site', discovered, probe: null })
    }
  }

  // Raw envelope inspection: /api/social/check?raw=instagram&handle=chipotle
  // Returns the top-level and data keys of the live response so the exact
  // SocialCrawl shape can be confirmed against the parser.
  const rawPlatform = params.get('raw')
  const rawHandle = params.get('handle')
  if (rawPlatform && rawHandle && key.length) {
    const endpoint = new URL(`https://www.socialcrawl.dev/v1/${rawPlatform}/profile/full`)
    endpoint.searchParams.set('handle', rawHandle)
    endpoint.searchParams.set('posts', '10')
    try {
      const res = await fetch(endpoint.toString(), { headers: { 'x-api-key': key, Accept: 'application/json' }, cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      return NextResponse.json({
        keyStatus,
        httpStatus: res.status,
        topLevelKeys: body && typeof body === 'object' ? Object.keys(body) : [],
        dataKeys: body?.data && typeof body.data === 'object' ? Object.keys(body.data) : [],
        authorKeys: body?.data?.author && typeof body.data.author === 'object' ? Object.keys(body.data.author) : [],
        computedKeys: body?.data?.computed && typeof body.data.computed === 'object' ? Object.keys(body.data.computed) : [],
        firstPostKeys: Array.isArray(body?.data?.posts) && body.data.posts[0] ? Object.keys(body.data.posts[0]) : [],
        sampleAuthor: body?.data?.author ?? null,
      })
    } catch (error: any) {
      return NextResponse.json({ keyStatus, rawError: error?.message || 'raw probe failed' })
    }
  }

  const hasTargets = Object.keys({ ...discovered, ...explicit }).length > 0
  if (!hasTargets) {
    return NextResponse.json({
      keyStatus,
      discovered,
      note: key.length
        ? 'Key present. Pass ?instagram=<handle> or ?url=<site> to run a live SocialCrawl probe.'
        : 'SOCIALCRAWL_API_KEY is missing/empty at runtime. Add it to this deployment environment and redeploy.',
      probe: null,
    })
  }

  const result = await auditSocialProfiles(explicit, discovered)
  const section = scoreSocial({ ...discovered, ...explicit }, result.profiles)

  return NextResponse.json({
    keyStatus,
    discovered,
    configured: result.configured,
    log: result.log,
    section: { earned: section.earned, max: section.max, status: section.status, detail: section.detail },
    profiles: result.profiles.map((p) => ({
      platform: p.platform,
      url: p.url,
      status: p.status,
      followers: p.followers,
      postsAnalyzed: p.postsAnalyzed,
      daysSinceLastPost: p.daysSinceLastPost,
      postsPerWeek: p.postsPerWeek,
      averageEngagementRate: p.averageEngagementRate,
      error: p.error,
    })),
  })
}
