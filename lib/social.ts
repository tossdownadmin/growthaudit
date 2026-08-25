import * as cheerio from 'cheerio'
import { fetchWebsiteHtml } from '@/lib/audit'
import { debugError, debugLog } from '@/lib/debug'

// ---------------------------------------------------------------------------
// Social profile DISCOVERY (from confirmed website HTML)
// ---------------------------------------------------------------------------

export type SocialPlatform =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'twitter'
  | 'threads'
  | 'linkedin'
  | 'pinterest'
  | 'snapchat'
  | 'whatsapp'

export type DiscoveredSocials = Partial<Record<SocialPlatform, string>>

export type BrandAssetVerification =
  | 'linked_on_gmb'
  | 'verified_brand_asset_missing_from_gmb'
  | 'verified_brand_asset'
  | 'candidate_needs_confirmation'

export type BrandAsset = {
  kind: 'website' | 'social'
  platform?: SocialPlatform
  url: string
  source: 'gmb' | 'website' | 'search'
  verification: BrandAssetVerification
  confidence: 'limited' | 'medium' | 'high'
  evidence: string[]
}

export type BrandAssetDiscovery = {
  website: BrandAsset | null
  socials: DiscoveredSocials
  assets: BrandAsset[]
  diagnostics?: DiscoverySearchDiagnostic[]
}

export type DiscoverySearchDiagnostic = {
  purpose: string
  outcome: 'not_started' | 'skipped' | 'completed' | 'no_results' | 'provider_error' | 'timed_out'
  resultCount: number
}

// Paths that indicate a share/intent widget rather than an owned profile.
const SHARE_BLOCKLIST =
  /(sharer|share\.php|\/share(\b|\/|\?)|\/intent\/|\/dialog\/|plugins\/|\/sharing\/|createpost|\/send\b|u=https?)/i

const PLATFORM_HOSTS: Record<SocialPlatform, RegExp> = {
  instagram: /(^|\.)instagram\.com$/i,
  facebook: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i,
  tiktok: /(^|\.)tiktok\.com$/i,
  youtube: /(^|\.)(youtube\.com|youtu\.be)$/i,
  twitter: /(^|\.)(twitter\.com|x\.com)$/i,
  threads: /(^|\.)(threads\.net|threads\.com)$/i,
  linkedin: /(^|\.)linkedin\.com$/i,
  pinterest: /(^|\.)(pinterest\.com|pin\.it|pinterest\.[a-z.]+)$/i,
  snapchat: /(^|\.)snapchat\.com$/i,
  whatsapp: /(^|\.)(wa\.me|whatsapp\.com)$/i,
}

// Non-profile first path segments to reject per platform.
const RESERVED_SEGMENTS: Partial<Record<SocialPlatform, RegExp>> = {
  instagram: /^(p|reel|reels|explore|accounts|stories|tv|direct)$/i,
  facebook: /^(sharer|share|dialog|plugins|events|groups|watch|marketplace|login|help)$/i,
  tiktok: /^(video|discover|tag|music|foryou|explore)$/i,
  twitter: /^(intent|home|share|hashtag|search|i|messages|explore|settings)$/i,
  youtube: /^(watch|results|feed|playlist|shorts|embed)$/i,
  pinterest: /^(pin|search|ideas|_)$/i,
  linkedin: /^(feed|sharing|shareArticle|posts|pulse)$/i,
}

function classifyUrl(raw: string): { platform: SocialPlatform; url: string } | null {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (!/^https?:$/i.test(parsed.protocol)) return null
  if (SHARE_BLOCKLIST.test(parsed.pathname + parsed.search)) return null

  const host = parsed.hostname.toLowerCase()
  const entry = (Object.keys(PLATFORM_HOSTS) as SocialPlatform[]).find((platform) =>
    PLATFORM_HOSTS[platform].test(host),
  )
  if (!entry) return null

  const segments = parsed.pathname.split('/').filter(Boolean)
  const first = segments[0] ? segments[0].replace(/^@/, '') : ''

  // WhatsApp / youtu.be style links carry the identifier differently.
  if (entry === 'whatsapp') {
    return { platform: entry, url: cleanUrl(parsed) }
  }

  // Require an identifiable handle for handle-based networks.
  const reserved = RESERVED_SEGMENTS[entry]
  if (entry !== 'facebook' && !first) return null
  if (reserved && first && reserved.test(first)) return null
  // Facebook profile.php?id= is valid.
  if (entry === 'facebook' && !first && !parsed.searchParams.get('id')) return null

  return { platform: entry, url: cleanUrl(parsed) }
}

function cleanUrl(parsed: URL) {
  // Preserve facebook profile.php?id=, otherwise drop query/hash noise.
  const keepQuery = /profile\.php/i.test(parsed.pathname) && parsed.searchParams.get('id')
  const path = parsed.pathname.replace(/\/+$/, '')
  const base = `https://${parsed.hostname.toLowerCase()}${path}`
  return keepQuery ? `${base}?id=${parsed.searchParams.get('id')}` : base
}

export function extractSocialLinks(html: string, baseUrl: string): DiscoveredSocials {
  const found: DiscoveredSocials = {}
  if (!html) return found

  let $: cheerio.CheerioAPI
  try {
    $ = cheerio.load(html)
  } catch {
    return found
  }

  const candidates: string[] = []
  const push = (value?: string | null) => {
    if (!value) return
    try {
      candidates.push(new URL(value, baseUrl).toString())
    } catch {
      /* ignore malformed */
    }
  }

  // 1) JSON-LD sameAs / Organization / Restaurant / LocalBusiness
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text()
    if (!raw) return
    try {
      const collectSameAs = (node: any) => {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) return node.forEach(collectSameAs)
        if (node.sameAs) {
          const list = Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs]
          list.forEach((entry: any) => typeof entry === 'string' && push(entry))
        }
        if (node['@graph']) collectSameAs(node['@graph'])
      }
      collectSameAs(JSON.parse(raw))
    } catch {
      /* ignore invalid JSON-LD */
    }
  })

  // 2) rel="me" links (explicit ownership signal)
  $('a[rel~="me"], link[rel~="me"]').each((_, el) => push($(el).attr('href')))

  // 3) All anchor hrefs (header, footer, nav all included)
  $('a[href]').each((_, el) => push($(el).attr('href')))

  // Priority ordering: sameAs/rel=me already appear first because of insertion order.
  for (const candidate of candidates) {
    const match = classifyUrl(candidate)
    if (match && !found[match.platform]) {
      found[match.platform] = match.url
    }
  }

  return found
}

const NON_BRAND_WEBSITE_HOSTS = [
  'google.com', 'googleusercontent.com', 'maps.google.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com',
  'doordash.com', 'ubereats.com', 'grubhub.com', 'skiptheddishes.com', 'deliveroo.co.uk', 'foodpanda.com',
  'yelp.com', 'tripadvisor.com', 'opentable.com', 'zomato.com', 'restaurantguru.com', 'foursquare.com', 'yellowpages.com', 'linktr.ee',
]

function normalizedWords(value: string): string[] {
  return String(value || '').toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((word) => !['restaurant', 'cafe', 'grill', 'the', 'and'].includes(word)) ?? []
}

function candidateWebsiteUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || ''))
    if (!/^https?:$/.test(url.protocol)) return null
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    if (NON_BRAND_WEBSITE_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return null
    if (classifyUrl(url.toString())) return null
    return `${url.origin}${url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')}`
  } catch {
    return null
  }
}

function hasBrandMatch(brandWords: string[], value: string): boolean {
  if (!brandWords.length) return false
  const haystack = String(value || '').toLowerCase()
  return brandWords.length === 1 ? haystack.includes(brandWords[0]) : brandWords.filter((word) => haystack.includes(word)).length >= Math.min(2, brandWords.length)
}

function addressEvidence(address: string, pageText: string): boolean {
  const meaningful = normalizedWords(address).filter((word) => !/^\d+$/.test(word))
  return meaningful.length > 0 && meaningful.filter((word) => pageText.includes(word)).length >= Math.min(2, meaningful.length)
}

function localityEvidence(address: string, pageText: string): boolean {
  const locality = socialSearchLocality(address).toLowerCase()
  return locality.length >= 3 && pageText.includes(locality)
}

function socialSearchLocality(address: string): string {
  return address.split(',').map((part) => part.trim()).reverse()
    .find((part) => /[a-z]/i.test(part) && !/^(pakistan|united states|usa|uk|united kingdom)$/i.test(part)) ?? ''
}

function isLikelyOfficialProfile(brandWords: string[], match: { url: string }, resultText: string): boolean {
  if (!hasBrandMatch(brandWords, resultText)) return false
  const handle = new URL(match.url).pathname.replace(/^\/+/, '').toLowerCase()
  // A one-word brand needs both a matching result label and a matching handle.
  return brandWords.length > 1 || brandWords.some((word) => handle.includes(word))
}

// SerpApi calls the canonical organic-result URL `link`. Normalize it at the
// provider boundary so every downstream verifier can depend on `url`.
type SearchResult = { url?: string; link?: string; title?: string; snippet?: string; description?: string; displayed_link?: string; domain?: string }

/**
 * Search Google results through SerpApi. This intentionally stays server-only:
 * the API key is never exposed to the browser and callers receive only the
 * small, provider-neutral result shape needed for brand verification.
 */
async function searchGoogle(query: string, timeoutMs = 8_000, diagnostics?: DiscoverySearchDiagnostic): Promise<SearchResult[]> {
  const apiKey = process.env.SERPAPI_API_KEY
  if (!apiKey || !query.trim()) {
    if (diagnostics) diagnostics.outcome = 'skipped'
    if (query.trim()) debugLog('social.serpapi', 'Search skipped because SERPAPI_API_KEY is not configured')
    return []
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const params = new URLSearchParams({ engine: 'google', q: query, api_key: apiKey, num: '10' })
    const response = await fetch(`https://serpapi.com/search.json?${params}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) {
      if (diagnostics) diagnostics.outcome = 'provider_error'
      debugError('social.serpapi', 'Google search request failed', new Error(`HTTP ${response.status}`))
      return []
    }
    const body = await response.json().catch(() => null)
    if (body?.error) {
      if (diagnostics) diagnostics.outcome = 'provider_error'
      debugError('social.serpapi', 'Google search returned a provider error', new Error('Provider returned an error response'), { purpose: diagnostics?.purpose })
      return []
    }
    const results: SearchResult[] = Array.isArray(body?.organic_results)
      ? body.organic_results.map((result: SearchResult) => ({ ...result, url: result.url ?? result.link }))
      : []
    if (diagnostics) {
      diagnostics.resultCount = results.length
      diagnostics.outcome = results.length ? 'completed' : 'no_results'
    }
    debugLog('social.serpapi', 'Google search completed', { purpose: diagnostics?.purpose, resultCount: results.length })
    return results
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    if (diagnostics) diagnostics.outcome = timedOut ? 'timed_out' : 'provider_error'
    if (!timedOut) debugError('social.serpapi', 'Google search failed', error, { purpose: diagnostics?.purpose })
    return []
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Finds a likely owned website only when Google Business Profile has none.
 * Search is merely a discovery source: the returned site needs independent
 * name/address evidence before it is marked verified and used for social links.
 */
export async function discoverBrandAssets(name: string, address: string): Promise<BrandAssetDiscovery> {
  const diagnostics: DiscoverySearchDiagnostic[] = [
    { purpose: 'brand-local', outcome: 'not_started', resultCount: 0 },
    { purpose: 'brand-official-website', outcome: 'not_started', resultCount: 0 },
  ]
  const empty: BrandAssetDiscovery = { website: null, socials: {}, assets: [], diagnostics }
  const brandWords = normalizedWords(name)
  if (!process.env.SERPAPI_API_KEY || !name.trim() || !brandWords.length) {
    diagnostics.forEach((entry) => { entry.outcome = 'skipped' })
    return empty
  }

  try {
    const keyword = `${name} ${address}`.replace(/\s+/g, ' ').trim()
    const [localResults, brandResults] = await Promise.all([
      searchGoogle(keyword, 8_000, diagnostics[0]),
      searchGoogle(`${name} official website`, 8_000, diagnostics[1]),
    ])
    const items = [...localResults, ...brandResults]
    let bestUnverified: BrandAssetDiscovery | null = null

    for (const item of items) {
      const url = candidateWebsiteUrl(item?.url)
      if (!url) continue
      const searchText = `${item?.title ?? ''} ${item?.description ?? ''} ${item?.domain ?? ''}`
      const searchBrandMatch = hasBrandMatch(brandWords, searchText)
      if (!searchBrandMatch) continue

      const fetched = await fetchWebsiteHtml(url)
      if (!fetched.html) continue
      const $ = cheerio.load(fetched.html)
      const title = $('title').first().text()
      const headings = $('h1, h2').map((_, element) => $(element).text()).get().join(' ')
      const pageText = $('body').text().replace(/\s+/g, ' ').toLowerCase()
      const titleOrHeadingMatch = hasBrandMatch(brandWords, `${title} ${headings}`)
      const locationMatch = addressEvidence(address, pageText)
      const cityMatch = localityEvidence(address, pageText)
      const evidence: string[] = []
      if (searchBrandMatch) evidence.push('Brand name matched in a location-specific search result')
      if (titleOrHeadingMatch) evidence.push('Brand name matched the website title or heading')
      if (locationMatch) evidence.push('Google profile location matched text on the website')
      if (!locationMatch && cityMatch) evidence.push('Google profile city matched text on the brand website')
      const verified = titleOrHeadingMatch && (locationMatch || cityMatch)
      const confidence: BrandAsset['confidence'] = verified ? 'high' : titleOrHeadingMatch ? 'medium' : 'limited'
      const website: BrandAsset = {
        kind: 'website',
        url: fetched.finalUrl || url,
        source: 'search',
        verification: verified ? 'verified_brand_asset_missing_from_gmb' : 'candidate_needs_confirmation',
        confidence,
        evidence,
      }
      const socials = verified ? extractSocialLinks(fetched.html, website.url) : {}
      const assets: BrandAsset[] = [website]
      if (verified) {
        for (const [platform, socialUrl] of Object.entries(socials) as Array<[SocialPlatform, string]>) {
          assets.push({ kind: 'social', platform, url: socialUrl, source: 'website', verification: 'verified_brand_asset', confidence: 'high', evidence: ['Linked from the verified official website'] })
        }
      }
      const discovery = { website, socials, assets, diagnostics }
      if (verified) {
        debugLog('social.brand-discover', 'Brand asset discovery completed', { name, verified, website: website.url, platforms: Object.keys(socials) })
        return discovery
      }
      if (!bestUnverified) bestUnverified = discovery
    }
    if (bestUnverified) return bestUnverified
  } catch (error) {
    debugError('social.brand-discover', 'Brand asset discovery failed', error, { name })
  }
  return empty
}

/**
 * Searches each missing core platform independently, including when no
 * website exists. Chain-level profiles rarely contain a branch's full address.
 */
export async function discoverVerifiedSocialsFromSearch(
  name: string,
  address: string,
  platforms: SocialPlatform[],
): Promise<{ socials: DiscoveredSocials; assets: BrandAsset[]; diagnostics: DiscoverySearchDiagnostic[] }> {
  const diagnostics: DiscoverySearchDiagnostic[] = []
  const empty = { socials: {} as DiscoveredSocials, assets: [] as BrandAsset[], diagnostics }
  const brandWords = normalizedWords(name)
  if (!process.env.SERPAPI_API_KEY || !name.trim() || !platforms.length || !brandWords.length) return empty

  const searchOne = async (platform: SocialPlatform): Promise<BrandAsset | null> => {
    try {
      const hostHint: Record<SocialPlatform, string> = {
        instagram: 'instagram.com', facebook: 'facebook.com', tiktok: 'tiktok.com', youtube: 'youtube.com', twitter: 'x.com OR twitter.com', threads: 'threads.net', linkedin: 'linkedin.com', pinterest: 'pinterest.com', snapchat: 'snapchat.com', whatsapp: 'wa.me',
      }
      const localQuery = `site:${hostHint[platform]} \"${name}\" ${socialSearchLocality(address)}`.replace(/\s+/g, ' ').trim()
      const brandQuery = `site:${hostHint[platform]} \"${name}\"`.replace(/\s+/g, ' ').trim()
      const localDiagnostic: DiscoverySearchDiagnostic = { purpose: `${platform}-local`, outcome: 'not_started', resultCount: 0 }
      const brandDiagnostic: DiscoverySearchDiagnostic = { purpose: `${platform}-brand`, outcome: 'not_started', resultCount: 0 }
      diagnostics.push(localDiagnostic, brandDiagnostic)
      const [localResults, brandResults] = await Promise.all([searchGoogle(localQuery, 8_000, localDiagnostic), searchGoogle(brandQuery, 8_000, brandDiagnostic)])
      const items = [...localResults, ...brandResults]
      for (const item of items) {
        const match = classifyUrl(String(item?.url || ''))
        if (!match || match.platform !== platform) continue
        const resultText = `${item?.title ?? ''} ${item?.description ?? ''}`
        if (!isLikelyOfficialProfile(brandWords, match, resultText)) continue
        return {
          kind: 'social',
          platform,
          url: match.url,
          source: 'search',
          verification: 'verified_brand_asset',
          confidence: 'medium',
          evidence: ['Profile handle and result text matched the restaurant brand in a platform-specific city search', 'This official brand profile is not linked from this branch’s website or Google profile'],
        }
      }
    } catch (error) {
      debugError('social.brand-search', 'Platform social discovery failed', error, { platform, name })
    }
    return null
  }

  const matches = await Promise.all(platforms.map(searchOne))
  for (const asset of matches) {
    if (!asset?.platform) continue
    empty.socials[asset.platform] = asset.url
    empty.assets.push(asset)
  }
  debugLog('social.brand-search', 'Verified platform search completed', { name, locality: socialSearchLocality(address), requestedPlatforms: platforms, foundPlatforms: Object.keys(empty.socials), diagnostics })
  return empty
}

export function extractHandle(platform: SocialPlatform, url: string): string | null {
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (platform === 'facebook') return null // Facebook adapter uses the full URL.
    const first = segments[0]?.replace(/^@/, '') ?? ''
    return first || null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Normalized social audit schema (owned by us, not the provider)
// ---------------------------------------------------------------------------

export type SocialStatus =
  | 'active'
  | 'inconsistent'
  | 'dormant'
  | 'insufficient_data'
  | 'unavailable'

export type SocialProfileAudit = {
  platform: string
  url: string
  status: SocialStatus
  followers: number | null
  following: number | null
  // The external link a channel exposes in its bio ("link in bio"). Used to check
  // whether the restaurant is routing social traffic to its OWN website.
  bioLink: string | null
  postsAnalyzed: number
  latestPostAt: string | null
  daysSinceLastPost: number | null
  posts30d: number | null
  posts90d: number | null
  postsPerWeek: number | null
  longestGapDays: number | null
  averageEngagementRate: number | null
  averageLikes: number | null
  averageComments: number | null
  providerCadence: number | null
  evidenceConfidence: number
  error?: string | null
}

const SOCIALCRAWL_BASE = 'https://www.socialcrawl.dev/v1'

function firstNumber(...values: any[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return null
}

function pick<T = any>(obj: any, keys: string[]): T | null {
  if (!obj || typeof obj !== 'object') return null
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key]
  }
  return null
}

// SocialCrawl list/profile items wrap the post as { post: {...}, computed: {...} }.
// The engagement counts live under post.engagement and the timestamp under
// post.published_at (or post.ext.published_at_epoch). Older/other shapes put the
// fields at the top level, so we unwrap defensively and fall back.
function unwrapPostItem(item: any): { post: any; computed: any } {
  if (item && typeof item === 'object' && item.post && typeof item.post === 'object') {
    return { post: item.post, computed: item.computed ?? null }
  }
  return { post: item ?? {}, computed: item?.computed ?? null }
}

function toMs(raw: any): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') {
    const ms = raw < 1e12 ? raw * 1000 : raw // seconds vs ms heuristic
    return Number.isFinite(ms) ? ms : null
  }
  const parsed = Date.parse(String(raw))
  return Number.isFinite(parsed) ? parsed : null
}

// Defensively pull a timestamp (ms) out of a post-like item.
function postTimestamp(item: any): number | null {
  const { post } = unwrapPostItem(item)
  const raw =
    pick(post, [
      'published_at',
      'publishedAt',
      'timestamp',
      'taken_at',
      'takenAt',
      'taken_at_timestamp',
      'created_time',
      'createTime',
      'create_time',
      'createdAt',
      'created_at',
      'date',
      'time',
    ]) ?? pick(post?.ext, ['published_at_epoch', 'publishedAtEpoch'])
  return toMs(raw)
}

function postLikes(item: any): number | null {
  const { post } = unwrapPostItem(item)
  return firstNumber(
    pick(post?.engagement, ['likes', 'like_count', 'likeCount', 'diggCount', 'reactions']),
    pick(post, ['likes', 'like_count', 'likeCount', 'likesCount', 'diggCount', 'reactions']),
  )
}

function postComments(item: any): number | null {
  const { post } = unwrapPostItem(item)
  return firstNumber(
    pick(post?.engagement, ['comments', 'comment_count', 'commentCount']),
    pick(post, ['comments', 'comment_count', 'commentCount', 'commentsCount']),
  )
}

// Per-post engagement rate the provider already computed (documented 0-1 fraction).
function postEngagementRate(item: any): number | null {
  const { computed } = unwrapPostItem(item)
  return firstNumber(pick(computed, ['engagement_rate', 'engagementRate']))
}

type ActivityCalc = {
  postsAnalyzed: number
  latestPostAt: string | null
  daysSinceLastPost: number | null
  posts30d: number | null
  posts90d: number | null
  postsPerWeek: number | null
  longestGapDays: number | null
  averageLikes: number | null
  averageComments: number | null
  averagePostEngagementRate: number | null
}

// Independently calculate activity from raw post timestamps.
export function calculateActivity(posts: any[]): ActivityCalc {
  const now = Date.now()
  const timestamps = [...new Set(
    posts
      .map(postTimestamp)
      .filter((value): value is number => value !== null)
  )].sort((a, b) => b - a)

  const likeValues = posts.map(postLikes).filter((v): v is number => v !== null)
  const commentValues = posts.map(postComments).filter((v): v is number => v !== null)
  const averageLikes = likeValues.length
    ? Math.round(likeValues.reduce((a, b) => a + b, 0) / likeValues.length)
    : null
  const averageComments = commentValues.length
    ? Math.round(commentValues.reduce((a, b) => a + b, 0) / commentValues.length)
    : null

  // Average the provider's per-post engagement_rate (0-1) → percentage.
  const perPostRates = posts.map(postEngagementRate).filter((v): v is number => v !== null)
  const averagePostEngagementRate = perPostRates.length
    ? Math.round((perPostRates.reduce((a, b) => a + b, 0) / perPostRates.length) * 100 * 100) / 100
    : null

  if (!timestamps.length) {
    return {
      postsAnalyzed: posts.length,
      latestPostAt: null,
      daysSinceLastPost: null,
      posts30d: null,
      posts90d: null,
      postsPerWeek: null,
      longestGapDays: null,
      averageLikes,
      averageComments,
      averagePostEngagementRate,
    }
  }

  const latest = timestamps[0]
  const day = 86400000
  const daysSinceLastPost = Math.floor((now - latest) / day)
  const posts30d = timestamps.filter((t) => now - t <= 30 * day).length
  const posts90d = timestamps.filter((t) => now - t <= 90 * day).length

  // Posting cadence via the MEDIAN gap between consecutive posts, which is robust
  // to a few old/pinned posts stretching the sample span (a straight
  // count/span average badly understated cadence — e.g. 5 posts in 17 days read
  // as 1.3/month because two old posts dragged the span to ~9 months). We favor
  // recent posts (last 90 days) and fall back to the full sample when sparse.
  const recent = timestamps.filter((t) => now - t <= 90 * day)
  const cadenceSet = recent.length >= 4 ? recent : timestamps
  let postsPerWeek: number | null = null
  // Cadence from only two or three timestamps is too volatile to present as a
  // professional posting-frequency metric.
  if (cadenceSet.length >= 4) {
    const gaps: number[] = []
    for (let i = 0; i < cadenceSet.length - 1; i += 1) {
      gaps.push((cadenceSet[i] - cadenceSet[i + 1]) / day)
    }
    gaps.sort((a, b) => a - b)
    const mid = Math.floor(gaps.length / 2)
    const medianGapDays = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2
    if (medianGapDays > 0) postsPerWeek = Math.round((7 / medianGapDays) * 10) / 10
  }

  let longestGapDays: number | null = null
  if (timestamps.length > 1) {
    let maxGap = 0
    for (let i = 0; i < timestamps.length - 1; i += 1) {
      maxGap = Math.max(maxGap, timestamps[i] - timestamps[i + 1])
    }
    longestGapDays = Math.round(maxGap / day)
  }

  return {
    postsAnalyzed: posts.length,
    latestPostAt: new Date(latest).toISOString(),
    daysSinceLastPost,
    posts30d,
    posts90d,
    postsPerWeek,
    longestGapDays,
    averageLikes,
    averageComments,
    averagePostEngagementRate,
  }
}

export function classifyActivity(calc: ActivityCalc): SocialStatus {
  const { daysSinceLastPost, postsPerWeek, posts30d, postsAnalyzed, latestPostAt } = calc

  // Not enough evidence to judge. Three or fewer posts can tell us a profile
  // exists, but not whether the restaurant has a real publishing rhythm.
  if (!latestPostAt || postsAnalyzed < 4 || daysSinceLastPost === null) {
    return 'insufficient_data'
  }

  const weekly = postsPerWeek ?? 0
  const recent30 = posts30d ?? 0

  if (daysSinceLastPost <= 14 && weekly >= 0.85) return 'active'
  if (daysSinceLastPost <= 30 && recent30 >= 1) return 'inconsistent'
  if (daysSinceLastPost > 30) return 'dormant'
  // Posted within 30 days but very irregular.
  return 'inconsistent'
}

function engagementRate(
  followers: number | null,
  averageLikes: number | null,
  averageComments: number | null,
  postsAnalyzed = 0,
): number | null {
  // Tiny audiences and tiny post samples can create absurd-looking 100%+
  // engagement figures that are mathematically possible but commercially
  // meaningless. Suppress them rather than presenting false precision.
  if (!followers || followers < 100 || postsAnalyzed < 5) return null
  if (averageLikes === null && averageComments === null) return null
  const perPost = (averageLikes ?? 0) + (averageComments ?? 0)
  const rate = Math.round((perPost / followers) * 100 * 100) / 100
  return rate > 40 ? null : rate
}

async function socialCrawlOnce(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  timeoutMs: number,
): Promise<any> {
  const endpoint = new URL(`${SOCIALCRAWL_BASE}${path}`)
  Object.entries(params).forEach(([key, value]) => endpoint.searchParams.set(key, value))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  // Log the request without leaking the key (path + params only).
  console.log('[v0][social.request] SocialCrawl request', { url: `${SOCIALCRAWL_BASE}${path}`, params })
  try {
    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      // SocialCrawl auth is a single x-api-key header — never in the query string.
      headers: { 'x-api-key': apiKey, Accept: 'application/json' },
    })
    const data = await response.json().catch(() => ({}))
    console.log('[v0][social.response] SocialCrawl response', {
      path,
      httpStatus: response.status,
      ok: response.ok,
      success: data?.success,
      topLevelKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 12) : [],
    })
    if (!response.ok) {
      // Error envelope: { success:false, error:{ type, message, doc_url } }
      const message =
        pick(data?.error, ['message', 'type']) ||
        pick(data, ['message', 'error', 'detail']) ||
        `HTTP ${response.status}`
      const err: any = new Error(String(message))
      // 429 rate limit and 502/503 (credits refunded) are safe to retry.
      err.retryable = response.status === 429 || response.status === 502 || response.status === 503
      throw err
    }
    // Some unified APIs return HTTP 200 with success:false for soft failures.
    if (data && data.success === false) {
      const message = pick(data?.error, ['message', 'type']) || 'SocialCrawl returned success:false'
      throw new Error(String(message))
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

async function socialCrawlRequest(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  timeoutMs: number,
): Promise<any> {
  const attempts = 2
  let lastError: any = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await socialCrawlOnce(path, params, apiKey, timeoutMs)
    } catch (error: any) {
      lastError = error
      if (error?.name === 'AbortError') error.retryable = true
      const canRetry = attempt < attempts && error?.retryable === true
      if (!canRetry) break
      await new Promise((resolve) => setTimeout(resolve, 900))
    }
  }
  throw lastError ?? new Error('SocialCrawl request failed')
}

// Locate the profile object and posts array in a provider response defensively.
//
// SocialCrawl envelope is { success, platform, endpoint, data: {...} }. For the
// /profile/full (prism) endpoints, data = { author, posts[], computed, legs[] }:
//   - author:   unified profile (followers, following, posts_count, ...)
//   - posts:    recent-post list (each: published_at, likes, comments, views, ...)
//   - computed: engagement_rate, posting cadence, top post, format mix
// Base /profile endpoints put the author fields directly on data. We handle both.
function unwrapProvider(data: any): { profile: any; posts: any[]; computed: any; cadence: number | null } {
  const root = data?.data ?? data?.result ?? data ?? {}
  const profile =
    pick(root, ['author', 'profile', 'user', 'account', 'channel']) ?? root
  const postsRaw =
    pick(root, ['posts', 'recent_posts', 'recentPosts', 'media', 'items', 'videos']) ??
    pick(profile, ['posts', 'recent_posts', 'recentPosts', 'media', 'items', 'videos']) ??
    []
  const posts = Array.isArray(postsRaw) ? postsRaw : []

  // Prism computed block (falls back to older analytics/stats naming).
  const computed =
    pick(root, ['computed', 'analytics', 'stats', 'insights']) ?? {}
  const cadence = firstNumber(
    pick(computed, [
      'posts_per_week',
      'postsPerWeek',
      'posting_cadence',
      'postingCadence',
      'cadence',
      'posts_per_week_estimate',
    ]),
    pick(computed?.cadence, ['posts_per_week', 'postsPerWeek']),
    pick(profile, ['posts_per_week', 'postsPerWeek']),
  )

  return { profile, posts, computed, cadence }
}

function followersFrom(profile: any): number | null {
  return firstNumber(
    pick(profile, [
      'followers',
      'followers_count',
      'followerCount',
      'followersCount',
      'fans',
      'fan_count',
      'subscriberCount',
      'subscribers',
    ]),
  )
}

function followingFrom(profile: any): number | null {
  return firstNumber(
    pick(profile, ['following', 'following_count', 'followingCount', 'follows']),
  )
}

// Social platform + CDN hosts that are NOT an external "link in bio". We skip
// these so the bio link we surface is the business's own destination.
const SOCIAL_SELF_HOSTS = [
  'instagram.com', 'instagr.am', 'cdninstagram.com', 'facebook.com', 'fb.com', 'fb.me',
  'fb.watch', 'fbcdn.net', 'tiktok.com', 'tiktokcdn.com', 'twitter.com', 'x.com',
  'threads.net', 'youtube.com', 'youtu.be', 'ggpht.com', 'ytimg.com', 'licdn.com',
  'pinterest.com', 'pinimg.com', 'snapchat.com',
]
// Redirect wrappers used by social apps around bio links. We unwrap to the real
// destination so host matching works (e.g. l.instagram.com/?u=<encoded-real-url>).
const REDIRECT_HOSTS = ['l.instagram.com', 'l.facebook.com', 'lm.facebook.com', 'l.threads.net', 'away.vk.com']

function unwrapRedirect(raw: string): string {
  try {
    const u = new URL(raw)
    if (REDIRECT_HOSTS.includes(u.hostname.toLowerCase())) {
      const target = u.searchParams.get('u') || u.searchParams.get('url') || u.searchParams.get('q')
      if (target) return decodeURIComponent(target)
    }
  } catch { /* not a parseable URL */ }
  return raw
}

function hostname(raw: string): string {
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' }
}

// The "link in bio" a channel exposes. Providers name it inconsistently across
// Instagram / TikTok / Facebook and sometimes nest it (about/contact blocks) or
// wrap it in a redirect, so instead of guessing exact keys we deep-walk the
// whole provider response, collect URLs from link-like fields, unwrap redirects,
// and return the first that points somewhere OTHER than the social platform.
function bioLinkFrom(...sources: any[]): string | null {
  const LINK_KEY = /(^|_|\b)(external|bio|website|web|site|homepage|home_page|url|link|contact|domain)s?($|_|\b)/i
  const MEDIA_KEY = /(image|img|pic|photo|avatar|thumb|thumbnail|media|video|cover|logo|banner|icon|src|profile_pic)/i
  const MEDIA_EXT = /\.(jpg|jpeg|png|webp|gif|svg|mp4|mov|webm|heic)(\?|$)/i
  const found: string[] = []
  const consider = (key: string, value: string) => {
    if (MEDIA_KEY.test(key)) return
    let v = String(value || '').trim()
    if (!v) return
    if (!/^https?:\/\//i.test(v)) { if (!/^[\w-]+(\.[\w-]+)+(\/|$)/.test(v)) return; v = `https://${v.replace(/^\/+/, '')}` }
    v = unwrapRedirect(v)
    if (MEDIA_EXT.test(v)) return
    const h = hostname(v)
    if (!h || SOCIAL_SELF_HOSTS.some((d) => h === d || h.endsWith('.' + d))) return
    found.push(v)
  }
  const walk = (node: any, key: string, depth: number) => {
    if (node == null || depth > 5) return
    if (typeof node === 'string') { if (LINK_KEY.test(key)) consider(key, node); return }
    if (typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach((n) => walk(n, key, depth + 1)); return }
    for (const k of Object.keys(node)) walk(node[k], k, depth + 1)
  }
  for (const src of sources) walk(src, '', 0)
  return found[0] ?? null
}

function providerEngagementRate(source: any): number | null {
  if (!source || typeof source !== 'object') return null
  // engagement_rate may sit directly on computed, or under computed.metrics.
  return firstNumber(
    pick(source, ['engagement_rate', 'engagementRate', 'avg_engagement_rate', 'averageEngagementRate']),
    pick(source?.metrics, ['engagement_rate', 'engagementRate', 'avg_engagement_rate', 'averageEngagementRate']),
  )
}

function normalizeProvider(
  platform: string,
  url: string,
  data: any,
): SocialProfileAudit {
  const { profile, posts, computed, cadence } = unwrapProvider(data)
  // Search the profile plus the raw response root (bio links sometimes live in
  // an about/contact block rather than on the author object).
  const bioLink = bioLinkFrom(profile, data?.data ?? data?.result ?? data)
  console.log('[v0][social.biolink] Extracted bio link', { platform, bioLink })
  const followers = followersFrom(profile)
  const following = followingFrom(profile)
  const calc = calculateActivity(posts)

  let engagement = engagementRate(followers, calc.averageLikes, calc.averageComments, calc.postsAnalyzed)
  // Fallback 1: average of the provider's per-post engagement_rate (already %).
  if (
    engagement === null &&
    calc.averagePostEngagementRate !== null &&
    (followers ?? 0) >= 100 &&
    calc.postsAnalyzed >= 5 &&
    calc.averagePostEngagementRate <= 40
  ) {
    engagement = calc.averagePostEngagementRate
  }
  // Fallback 2: profile-level engagement_rate (documented 0-1 fraction → %).
  let providerEngagement = providerEngagementRate(computed) ?? providerEngagementRate(profile)
  if (providerEngagement !== null && providerEngagement <= 1) {
    providerEngagement = Math.round(providerEngagement * 100 * 100) / 100
  }
  if (
    engagement === null &&
    providerEngagement !== null &&
    (followers ?? 0) >= 100 &&
    calc.postsAnalyzed >= 5 &&
    providerEngagement <= 40
  ) {
    engagement = providerEngagement
  }

  // High-looking engagement percentages from short public samples are often
  // mathematically real but commercially unstable. Keep them internally, but
  // suppress the exact percentage unless there is enough post depth to support
  // the claim. This prevents 10-post / 177-follower profiles from showing a
  // misleadingly precise 20%+ engagement figure.
  if (engagement !== null && engagement > 10 && calc.postsAnalyzed < 20) {
    engagement = null
  }
  if (engagement !== null && engagement > 20) {
    engagement = null
  }

  // Confidence: start high, reduce when evidence is thin or signals disagree.
  let confidence = 1
  if (calc.postsAnalyzed === 0) confidence = 0.15
  else if (calc.postsAnalyzed < 5) confidence = 0.4
  else if (calc.postsAnalyzed < 12) confidence = 0.7
  if (calc.latestPostAt === null) confidence = Math.min(confidence, 0.3)
  // Cross-check our cadence vs provider cadence.
  if (cadence !== null && calc.postsPerWeek !== null) {
    const diff = Math.abs(cadence - calc.postsPerWeek)
    if (diff > Math.max(1.5, calc.postsPerWeek * 0.75)) confidence = Math.min(confidence, 0.5)
  }

  let safePostsPerWeek = calc.postsPerWeek
  // Extremely high cadence often means duplicate/pinned/provider artifacts.
  // Keep recency evidence, but do not print a suspicious exact frequency.
  if (safePostsPerWeek !== null && safePostsPerWeek > 14) {
    confidence = Math.min(confidence, 0.45)
    safePostsPerWeek = cadence !== null && cadence <= 14 ? cadence : null
  }

  confidence = Math.round(confidence * 100) / 100

  return {
    platform,
    url,
    status: classifyActivity(calc),
    followers,
    following,
    bioLink,
    postsAnalyzed: calc.postsAnalyzed,
    latestPostAt: calc.latestPostAt,
    daysSinceLastPost: calc.daysSinceLastPost,
    posts30d: calc.posts30d,
    posts90d: calc.posts90d,
    postsPerWeek: safePostsPerWeek,
    longestGapDays: calc.longestGapDays,
    averageEngagementRate: engagement,
    averageLikes: calc.averageLikes,
    averageComments: calc.averageComments,
    providerCadence: cadence,
    evidenceConfidence: confidence,
    error: null,
  }
}

function unavailable(platform: string, url: string, error: string): SocialProfileAudit {
  return {
    platform,
    url,
    status: 'unavailable',
    followers: null,
    following: null,
    bioLink: null,
    postsAnalyzed: 0,
    latestPostAt: null,
    daysSinceLastPost: null,
    posts30d: null,
    posts90d: null,
    postsPerWeek: null,
    longestGapDays: null,
    averageEngagementRate: null,
    averageLikes: null,
    averageComments: null,
    providerCadence: null,
    evidenceConfidence: 0,
    error,
  }
}

export type SocialAuditLogEntry = {
  platform: string
  url: string
  called: boolean
  ok: boolean
  error?: string | null
}

export type SocialAuditResult = {
  configured: boolean
  discovered: DiscoveredSocials
  profiles: SocialProfileAudit[]
  log: SocialAuditLogEntry[]
}

// V1 analytics platforms (one profile/full request per platform per audit).
const ANALYZED_PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok', 'facebook']
const SOCIAL_TIMEOUT_MS = 13000

async function auditOnePlatform(
  platform: SocialPlatform,
  url: string,
  apiKey: string,
): Promise<{ profile: SocialProfileAudit; log: SocialAuditLogEntry }> {
  try {
    let data: any
    if (platform === 'instagram') {
      const handle = extractHandle('instagram', url)
      if (!handle) throw new Error('Instagram handle could not be parsed from URL')
      data = await socialCrawlRequest(
        '/instagram/profile/full',
        { handle, posts: '50' },
        apiKey,
        SOCIAL_TIMEOUT_MS,
      )
    } else if (platform === 'tiktok') {
      const handle = extractHandle('tiktok', url)
      if (!handle) throw new Error('TikTok handle could not be parsed from URL')
      data = await socialCrawlRequest(
        '/tiktok/profile/full',
        { handle, posts: '50' },
        apiKey,
        SOCIAL_TIMEOUT_MS,
      )
    } else {
      data = await socialCrawlRequest(
        '/facebook/profile/full',
        { url, posts: '50' },
        apiKey,
        SOCIAL_TIMEOUT_MS,
      )
    }
    const profile = normalizeProvider(platform, url, data)
    console.log('[v0][social.parsed] Parsed profile', {
      platform,
      followers: profile.followers,
      postsAnalyzed: profile.postsAnalyzed,
      latestPostAt: profile.latestPostAt,
      postsPerWeek: profile.postsPerWeek,
      status: profile.status,
      // Reveals when the envelope didn't unwrap the way we expect.
      responseDataKeys: data?.data && typeof data.data === 'object' ? Object.keys(data.data).slice(0, 12) : [],
    })
    return { profile, log: { platform, url, called: true, ok: true, error: null } }
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? 'SocialCrawl request timed out' : error?.message || 'SocialCrawl request failed'
    return {
      profile: unavailable(platform, url, message),
      log: { platform, url, called: true, ok: false, error: message },
    }
  }
}

/**
 * Run public social profile audits with per-call isolation.
 * A failure in one platform never rejects the whole audit.
 */
export async function auditSocialProfiles(
  confirmed: DiscoveredSocials,
  discovered: DiscoveredSocials,
): Promise<SocialAuditResult> {
  const rawKey = process.env.SOCIALCRAWL_API_KEY
  const apiKey = (rawKey || '').trim()
  const merged: DiscoveredSocials = { ...discovered, ...confirmed }

  // Key diagnostics: presence + length ONLY. Never log the actual secret value.
  console.log('[v0][social.config] SocialCrawl key check', {
    keyDefined: rawKey !== undefined,
    keyPresent: apiKey.length > 0,
    keyLength: apiKey.length,
    discoveredPlatforms: Object.keys(discovered),
    confirmedPlatforms: Object.keys(confirmed),
  })

  if (!apiKey) {
    console.warn('[v0][social.config] SOCIALCRAWL_API_KEY is missing/empty at runtime — social activity will not be measured. Add it to the deployment environment and redeploy.')
    return { configured: false, discovered: merged, profiles: [], log: [] }
  }

  const targets = ANALYZED_PLATFORMS.map((platform) => ({ platform, url: merged[platform] }))
    .filter((t): t is { platform: SocialPlatform; url: string } => Boolean(t.url))

  // Show which platforms will be analyzed and the handles parsed from each URL.
  console.log('[v0][social.targets] Analyzed platform targets', {
    targets: targets.map((t) => ({
      platform: t.platform,
      url: t.url,
      handle: t.platform === 'facebook' ? '(uses url)' : extractHandle(t.platform, t.url),
    })),
  })

  if (!targets.length) {
    return { configured: true, discovered: merged, profiles: [], log: [] }
  }

  const settled = await Promise.allSettled(
    targets.map((t) => auditOnePlatform(t.platform, t.url, apiKey)),
  )

  const profiles: SocialProfileAudit[] = []
  const log: SocialAuditLogEntry[] = []
  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      profiles.push(outcome.value.profile)
      log.push(outcome.value.log)
    } else {
      const target = targets[index]
      profiles.push(unavailable(target.platform, target.url, 'Social audit rejected'))
      log.push({ platform: target.platform, url: target.url, called: true, ok: false, error: 'rejected' })
    }
  })

  return { configured: true, discovered: merged, profiles, log }
}

// ---------------------------------------------------------------------------
// Social pillar scoring (~10 points, engagement-first, follower-agnostic)
// ---------------------------------------------------------------------------

export type SocialSection = {
  earned: number | null
  max: number
  status: 'good' | 'warning' | 'bad' | 'unknown'
  detail: string
  evidence: string[]
}

const STATUS_WEIGHT: Record<SocialStatus, number> = {
  active: 1,
  inconsistent: 0.55,
  dormant: 0.15,
  insufficient_data: 0.5,
  unavailable: 0,
}

export function scoreSocial(
  discovered: DiscoveredSocials,
  profiles: SocialProfileAudit[],
): SocialSection {
  const max = 10
  const discoveredCount = Object.keys(discovered).length
  const measured = profiles.filter((p) => p.status !== 'unavailable')
  const reliable = measured.filter(
    (p) =>
      p.status !== 'insufficient_data' &&
      p.postsAnalyzed >= 4 &&
      p.evidenceConfidence >= 0.45,
  )

  // Nothing confirmed at all. Absence from the restaurant website / submitted
  // links is not enough evidence to claim the brand has no social presence, so
  // this remains unscored rather than becoming a false 0/10.
  if (discoveredCount === 0 && profiles.length === 0) {
    return {
      earned: null,
      max,
      status: 'unknown',
      detail: 'No customer-facing social profile was confirmed from the available public paths.',
      evidence: [],
    }
  }

  // Profiles can be confirmed even when the post sample is too thin to score
  // activity. Presence is useful evidence, but it is never converted into a
  // false pass.
  if (reliable.length === 0) {
    return {
      earned: null,
      max,
      status: 'unknown',
      detail:
        profiles.length > 0 || discoveredCount > 0
          ? 'Public social profiles are confirmed; activity scoring waits for a reliable public post sample.'
          : 'No public social profiles were discovered or confirmed.',
      evidence: measured.map((p) => `${p.platform}: profile confirmed · ${p.postsAnalyzed} public posts observed`),
    }
  }

  // Sub-pillar weights: recency 30%, consistency 30%, engagement 25%, coverage 15%.
  const best = [...reliable].sort(
    (a, b) => STATUS_WEIGHT[b.status] - STATUS_WEIGHT[a.status],
  )[0]

  const recency = (() => {
    if (best.daysSinceLastPost === null) return 0.5
    if (best.daysSinceLastPost <= 7) return 1
    if (best.daysSinceLastPost <= 14) return 0.85
    if (best.daysSinceLastPost <= 30) return 0.55
    if (best.daysSinceLastPost <= 60) return 0.25
    return 0.1
  })()

  const consistency = (() => {
    const weekly = best.postsPerWeek
    if (weekly === null) return best.status === 'insufficient_data' ? 0.5 : 0.3
    if (weekly >= 3) return 1
    if (weekly >= 1) return 0.8
    if (weekly >= 0.5) return 0.5
    return 0.25
  })()

  const engagement = (() => {
    const values = reliable
      .filter((p) => p.evidenceConfidence >= 0.5 && (p.followers ?? 0) >= 100 && p.postsAnalyzed >= 5)
      .map((p) => p.averageEngagementRate)
      .filter((v): v is number => v !== null)
    if (!values.length) return null
    const rate = Math.max(...values)
    if (rate >= 3) return 1
    if (rate >= 1.5) return 0.8
    if (rate >= 0.5) return 0.55
    return 0.3
  })()

  const activeChannels = reliable.filter(
    (p) => p.status === 'active' || p.status === 'inconsistent',
  ).length
  const coverage = Math.min(1, activeChannels / 2) * 0.7 + Math.min(1, discoveredCount / 3) * 0.3

  // Redistribute engagement weight when engagement is unmeasurable.
  let recencyW = 0.3
  let consistencyW = 0.3
  let engagementW = 0.25
  const coverageW = 0.15
  if (engagement === null) {
    recencyW = 0.38
    consistencyW = 0.37
    engagementW = 0
  }

  const composite =
    recency * recencyW +
    consistency * consistencyW +
    (engagement ?? 0) * engagementW +
    coverage * coverageW

  const earned = Math.round(max * composite)

  const status: SocialSection['status'] =
    best.status === 'active' && composite >= 0.7 && best.evidenceConfidence >= 0.6
      ? 'good'
      : best.status === 'dormant' || composite < 0.35
        ? 'bad'
        : 'warning'

  const detailParts: string[] = []
  const label = best.platform.charAt(0).toUpperCase() + best.platform.slice(1)
  if (best.status === 'active') detailParts.push(`${label} is actively maintained`)
  else if (best.status === 'inconsistent') detailParts.push(`${label} posts inconsistently`)
  else if (best.status === 'dormant') detailParts.push(`${label} appears dormant`)
  else detailParts.push(`${label} has limited recent activity`)
  if (best.postsPerWeek !== null) detailParts.push(`${best.postsPerWeek}/week`)
  if (best.daysSinceLastPost !== null) detailParts.push(`last post ${best.daysSinceLastPost}d ago`)

  const evidence = reliable.map((p) => {
    const bits = [`${p.platform}: ${p.status}`]
    if (p.postsPerWeek !== null) bits.push(`${p.postsPerWeek}/wk`)
    if (p.averageEngagementRate !== null) bits.push(`${p.averageEngagementRate}% eng`)
    return bits.join(' · ')
  })

  return { earned, max, status, detail: `${detailParts.join(' · ')}.`, evidence }
}
