// LIGHTWEIGHT LOCAL COMPETITIVE BENCHMARK — V1
//
// This is deliberately narrower than the standalone competitor-search product.
// It exists to answer a restaurant-owner question inside the growth audit:
// "How do I stack up against restaurants customers are likely to consider nearby?"
//
// It uses only Google public business facts + a shallow website ordering check.
// No competitor SocialCrawl/Outscraper/PageSpeed calls are made.

import { inspectHtml } from '@/lib/audit'
import { scoreCompetitorQuality } from '@/lib/competitorQuality'

export type BenchmarkCandidate = {
  placeId: string
  name: string
  address: string
  distanceMi: number | null
  rating: number | null
  reviewCount: number | null
  primaryType: string
  types: string[]
  priceLevel: string | null
  websiteUrl: string | null
  discovery: string[]
  fitScore: number
  classification?: string | null
  threatScore?: number | null
  competitiveStrengthScore?: number | null
  evidenceConfidenceLabel?: string | null
  ordering: {
    status: string
    summary: string
    provider?: string | null
  } | null
}

export type CompetitorBenchmark = {
  status: 'ready' | 'limited' | 'unavailable'
  source?: 'universal_v3' | 'local_fallback' | 'none'
  engineVersion?: string | null
  confidence?: 'high' | 'medium' | 'limited'
  /** Owner-facing benchmark is rendered only when the dedicated engine returns a strong enough set. */
  presentationEligible?: boolean
  query: string
  radiusKm: number
  candidates: BenchmarkCandidate[]
  summary: {
    medianRating: number | null
    medianReviewCount: number | null
    directOrderingCount: number | null
    marketplaceOrderingCount: number | null
    orderingMeasuredCount: number
  }
  error?: string | null
}

const GOOGLE_BASE = 'https://places.googleapis.com/v1'

const GENERIC_TYPES = new Set([
  '',
  'restaurant',
  'food',
  'establishment',
  'point_of_interest',
])

const CONCEPT_TERMS = [
  'shawarma',
  'burger',
  'hamburger',
  'pizza',
  'sushi',
  'steak',
  'barbecue',
  'bbq',
  'tacos',
  'mexican',
  'italian',
  'chinese',
  'thai',
  'indian',
  'pakistani',
  'afghan',
  'mediterranean',
  'middle eastern',
  'korean',
  'japanese',
  'greek',
  'turkish',
  'halal',
  'vegan',
  'vegetarian',
  'seafood',
  'chicken',
  'wings',
  'ramen',
  'pho',
  'bakery',
  'coffee',
  'cafe',
  'brunch',
  'breakfast',
  'dessert',
  'ice cream',
  'donut',
  'sandwich',
  'hot chicken',
  'fried chicken',
  'kebab',
  'kabob',
  'gyro',
  'biryani',
  'karahi',
]

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

function prettyType(type: string) {
  return String(type || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function brandKey(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\b(restaurant|restaurants|cafe|café|kitchen|grill|bar|eatery|branch|location|store)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeSameBrand(candidateName: string, targetName: string) {
  const a = brandKey(candidateName)
  const b = brandKey(targetName)
  if (!a || !b) return false
  if (a === b) return true
  const shorter = a.length <= b.length ? a : b
  const longer = a.length > b.length ? a : b
  return shorter.length >= 5 && longer.includes(shorter)
}

function haversineMi(lat1?: number, lng1?: number, lat2?: number, lng2?: number) {
  if (![lat1, lng1, lat2, lng2].every((v) => Number.isFinite(Number(v)))) return null
  const rad = (value: number) => (value * Math.PI) / 180
  const r = 3958.7613
  const a =
    Math.sin(rad(Number(lat2) - Number(lat1)) / 2) ** 2 +
    Math.cos(rad(Number(lat1))) *
      Math.cos(rad(Number(lat2))) *
      Math.sin(rad(Number(lng2) - Number(lng1)) / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(a))
}

function median(values: number[]) {
  if (!values.length) return null
  const rows = [...values].sort((a, b) => a - b)
  const middle = Math.floor(rows.length / 2)
  return rows.length % 2
    ? rows[middle]
    : Math.round(((rows[middle - 1] + rows[middle]) / 2) * 100) / 100
}

function textEvidence(website: any) {
  return [
    website?.metaTags?.title,
    website?.metaTags?.description,
    ...(website?.headings?.h1 || []).slice(0, 3),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function deriveQuery(input: any, website: any) {
  const primaryType = String(input?.primaryType || '').toLowerCase()
  if (!GENERIC_TYPES.has(primaryType)) return prettyType(primaryType)

  const evidence = textEvidence(website)
  const matched = CONCEPT_TERMS
    .filter((term) => new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'i').test(evidence))
    .sort((a, b) => b.length - a.length)

  if (matched.length) {
    const first = matched[0] === 'bbq' ? 'barbecue' : matched[0]
    const second = matched.find((term) => term !== matched[0] && !first.includes(term))
    return `${first}${second ? ` ${second}` : ''} restaurant`
  }

  return 'restaurant'
}

async function googlePost(path: string, fieldMask: string, body: any, key: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)
  try {
    const response = await fetch(`${GOOGLE_BASE}/${path}`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`Google Places HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

function normalizePlace(place: any, source: string, input: any): BenchmarkCandidate | null {
  const placeId = String(place?.id || '')
  const name = String(place?.displayName?.text || 'Restaurant')
  if (!placeId || placeId === input?.placeId || looksLikeSameBrand(name, String(input?.name || ''))) return null

  const distance = haversineMi(
    Number(input?.lat),
    Number(input?.lng),
    Number(place?.location?.latitude),
    Number(place?.location?.longitude),
  )

  return {
    placeId,
    name,
    address: String(place?.formattedAddress || ''),
    distanceMi: distance === null ? null : Math.round(distance * 100) / 100,
    rating: typeof place?.rating === 'number' ? place.rating : null,
    reviewCount:
      typeof place?.userRatingCount === 'number' ? place.userRatingCount : null,
    primaryType: String(place?.primaryType || ''),
    types: Array.isArray(place?.types) ? place.types : [],
    priceLevel: place?.priceLevel ? String(place.priceLevel) : null,
    websiteUrl: place?.websiteUri ? String(place.websiteUri) : null,
    discovery: [source],
    fitScore: 0,
    ordering: null,
  }
}

function candidateFit(candidate: BenchmarkCandidate, input: any, textSearch: boolean) {
  const targetTypes = new Set(
    [input?.primaryType, ...(input?.types || [])]
      .filter(Boolean)
      .map((v: any) => String(v).toLowerCase()),
  )
  const candidateTypes = new Set(
    [candidate.primaryType, ...candidate.types]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase()),
  )

  let overlap = 0
  for (const type of targetTypes) if (candidateTypes.has(type)) overlap += 1
  const union = new Set([...targetTypes, ...candidateTypes]).size || 1
  const jaccard = overlap / union

  let score = 0

  if (
    input?.primaryType &&
    candidate.primaryType &&
    String(input.primaryType).toLowerCase() === candidate.primaryType.toLowerCase()
  ) {
    score += 28
  }

  score += jaccard * 22

  if (textSearch) score += 18

  if (candidate.distanceMi !== null) {
    score += clamp(25 * (1 - candidate.distanceMi / 5), 0, 25)
  }

  if (candidate.rating !== null) {
    score += clamp(((candidate.rating - 3.5) / 1.3) * 8, 0, 8)
  }

  if (candidate.reviewCount !== null) {
    score += clamp(Math.log10(candidate.reviewCount + 1) * 2.5, 0, 7)
  }

  if (
    input?.priceLevel &&
    candidate.priceLevel &&
    String(input.priceLevel) === candidate.priceLevel
  ) {
    score += 3
  }

  return Math.round(clamp(score))
}

function passesFocusedConceptGate(candidate: BenchmarkCandidate, input: any) {
  const target = String(input?.primaryType || '').toLowerCase()
  const cues: Record<string, RegExp> = {
    hamburger_restaurant: /burger|hamburger/i,
    pizza_restaurant: /pizza/i,
    sushi_restaurant: /sushi/i,
    steak_house: /steak/i,
    coffee_shop: /coffee|cafe/i,
    ice_cream_shop: /ice.?cream|gelato/i,
    shawarma_restaurant: /shawarma|doner|donair/i,
  }
  const cue = cues[target]
  if (!cue) return true
  const typeText = [candidate.primaryType, ...candidate.types].join(' ').replace(/_/g, ' ')
  return cue.test(`${candidate.name} ${typeText}`)
}

function mergeCandidate(map: Map<string, BenchmarkCandidate>, row: BenchmarkCandidate | null) {
  if (!row) return
  const existing = map.get(row.placeId)
  if (!existing) {
    map.set(row.placeId, row)
    return
  }

  existing.discovery = [...new Set([...existing.discovery, ...row.discovery])]
  if (!existing.websiteUrl && row.websiteUrl) existing.websiteUrl = row.websiteUrl
}

async function shallowOrderingAudit(candidate: BenchmarkCandidate) {
  if (!candidate.websiteUrl) {
    return {
      status: 'none',
      summary: 'No website was available from Google for a public ordering check.',
      provider: null,
    }
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6500)
    const response = await fetch(candidate.websiteUrl, {
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    }).finally(() => clearTimeout(timer))

    if (!response.ok) {
      return {
        status: 'unavailable',
        summary: 'Competitor website ordering could not be measured.',
        provider: null,
      }
    }

    const html = (await response.text()).slice(0, 450000)
    const inspection = inspectHtml(html, response.url || candidate.websiteUrl)

    return (
      inspection.ordering ?? {
        status: 'unclear',
        summary: 'Competitor ordering path was unclear from the public website.',
        provider: null,
      }
    )
  } catch {
    return {
      status: 'unavailable',
      summary: 'Competitor website ordering could not be measured.',
      provider: null,
    }
  }
}

async function buildLightweightCompetitorBenchmark(input: any, website: any): Promise<CompetitorBenchmark> {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || '').trim()
  const lat = Number(input?.lat)
  const lng = Number(input?.lng)

  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      status: 'unavailable',
      query: '',
      radiusKm: 5,
      candidates: [],
      summary: {
        medianRating: null,
        medianReviewCount: null,
        directOrderingCount: null,
        marketplaceOrderingCount: null,
        orderingMeasuredCount: 0,
      },
      error: 'Location or Google Places access unavailable.',
    }
  }

  const query = deriveQuery(input, website)
  const radiusMeters = 5000
  const fields =
    'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.primaryType,places.types,places.priceLevel,places.websiteUri'

  try {
    const nearbyBody: any = {
      maxResultCount: 14,
      rankPreference: 'POPULARITY',
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
    }

    const primaryType = String(input?.primaryType || '').toLowerCase()
    if (!GENERIC_TYPES.has(primaryType)) nearbyBody.includedTypes = [primaryType]
    else nearbyBody.includedTypes = ['restaurant']

    const textBody = {
      textQuery: query,
      maxResultCount: 14,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
    }

    const [nearbyResult, textResult] = await Promise.allSettled([
      googlePost('places:searchNearby', fields, nearbyBody, key),
      googlePost('places:searchText', fields, textBody, key),
    ])

    const candidates = new Map<string, BenchmarkCandidate>()

    if (nearbyResult.status === 'fulfilled') {
      for (const place of nearbyResult.value?.places || []) {
        mergeCandidate(candidates, normalizePlace(place, 'nearby', input))
      }
    }

    if (textResult.status === 'fulfilled') {
      for (const place of textResult.value?.places || []) {
        mergeCandidate(candidates, normalizePlace(place, 'targeted_search', input))
      }
    }

    const ordered = [...candidates.values()]
      .filter((candidate) => passesFocusedConceptGate(candidate, input))
      .map((candidate) => {
        const textSearch = candidate.discovery.includes('targeted_search')
        candidate.fitScore = candidateFit(candidate, input, textSearch)
        return candidate
      })
      .filter((candidate) => candidate.fitScore >= 22)
      // The lightweight Google fallback is only a resilience path, so keep a
      // conservative sanity filter here. The calibrated V3 engine below must
      // never be re-filtered by this simpler heuristic.
      .filter((candidate) => scoreCompetitorQuality(input, candidate).keep)
      .sort((a, b) => b.fitScore - a.fitScore)

    const ranked: BenchmarkCandidate[] = []
    const seenBrands = new Set<string>()
    for (const candidate of ordered) {
      const key = brandKey(candidate.name) || candidate.placeId
      if (seenBrands.has(key)) continue
      seenBrands.add(key)
      ranked.push(candidate)
      if (ranked.length >= 5) break
    }

    // Only the top three get a shallow website-ordering check. This keeps the
    // benchmark useful without multiplying paid APIs or running PageSpeed/social
    // analysis on competitors.
    const orderingRows = await Promise.all(
      ranked.slice(0, 3).map((candidate) => shallowOrderingAudit(candidate)),
    )
    orderingRows.forEach((ordering, index) => {
      if (ranked[index]) ranked[index].ordering = ordering
    })

    const ratings = ranked
      .map((candidate) => candidate.rating)
      .filter((value): value is number => value !== null)
    const reviewCounts = ranked
      .map((candidate) => candidate.reviewCount)
      .filter((value): value is number => value !== null)

    const measuredOrdering = ranked
      .map((candidate) => candidate.ordering)
      .filter(
        (ordering) =>
          ordering &&
          ordering.status !== 'unavailable' &&
          ordering.status !== 'unclear',
      )

    const directCount = measuredOrdering.filter(
      (ordering) =>
        ordering?.status === 'owned' ||
        ordering?.status === 'branded_direct',
    ).length
    const marketplaceCount = measuredOrdering.filter(
      (ordering) => ordering?.status === 'marketplace',
    ).length

    return {
      status: ranked.length >= 3 ? 'ready' : ranked.length ? 'limited' : 'unavailable',
      query,
      radiusKm: 5,
      candidates: ranked,
      summary: {
        medianRating: median(ratings),
        medianReviewCount: median(reviewCounts),
        directOrderingCount: measuredOrdering.length ? directCount : null,
        marketplaceOrderingCount: measuredOrdering.length ? marketplaceCount : null,
        orderingMeasuredCount: measuredOrdering.length,
      },
      error: ranked.length ? null : 'No plausible local benchmark set was found.',
    }
  } catch (error: any) {
    return {
      status: 'unavailable',
      query,
      radiusKm: 5,
      candidates: [],
      summary: {
        medianRating: null,
        medianReviewCount: null,
        directOrderingCount: null,
        marketplaceOrderingCount: null,
        orderingMeasuredCount: 0,
      },
      error: error?.message || 'Local benchmark failed.',
    }
  }
}

function competitorEngineEndpoint(raw: string) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.endsWith('/api/places/competitors')
    ? trimmed
    : `${trimmed}/api/places/competitors`
}

// The V3 competitor engine now lives INSIDE this app at /api/places/competitors.
// Resolve an absolute base URL to call it (server-to-server needs absolute).
// Priority: explicit COMPETITOR_ENGINE_URL override -> app base URL -> Vercel URL.
// This removes the old cross-deployment dependency: no separate engine repo,
// no drift. An override is still honored if you ever want to point elsewhere.
function localEngineBase(): string {
  const override = String(process.env.COMPETITOR_ENGINE_URL || '').trim().replace(/\/+$/, '')
  if (override) return override
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
  if (base) return base
  const vercel = String(process.env.VERCEL_URL || '').trim().replace(/\/+$/, '')
  if (vercel) return vercel.startsWith('http') ? vercel : `https://${vercel}`
  return 'http://localhost:3000'
}


function firstFiniteScore(...values: any[]): number | null {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function confidenceRank(label: string | null | undefined) {
  const value = String(label || '').toLowerCase()
  if (value.includes('high')) return 3
  if (value.includes('medium')) return 2
  if (value.includes('low') || value.includes('limited')) return 1
  return 0
}

async function buildUniversalCompetitorBenchmark(input: any, website: any): Promise<CompetitorBenchmark | null> {
  const endpoint = competitorEngineEndpoint(localEngineBase())
  if (!endpoint || !input?.placeId) return null

  const url = new URL(endpoint)
  url.searchParams.set('placeId', String(input.placeId))
  if (Number.isFinite(Number(input?.lat))) url.searchParams.set('lat', String(input.lat))
  if (Number.isFinite(Number(input?.lng))) url.searchParams.set('lng', String(input.lng))
  if (input?.name) url.searchParams.set('name', String(input.name))
  if (input?.primaryType) url.searchParams.set('primaryType', String(input.primaryType))
  if (Array.isArray(input?.types) && input.types.length) url.searchParams.set('types', input.types.join(','))
  if (input?.priceLevel) url.searchParams.set('priceLevel', String(input.priceLevel))
  if (input?.websiteUrl) url.searchParams.set('website', String(input.websiteUrl))
  if (website?.metaTags?.title) url.searchParams.set('siteTitle', String(website.metaTags.title).slice(0, 300))
  if (website?.metaTags?.description) url.searchParams.set('siteDescription', String(website.metaTags.description).slice(0, 500))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 70_000)
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const body = await response.json().catch(() => null)
    if (!body || body.status !== 'ok' || !Array.isArray(body.competitors)) return null

    const rows: BenchmarkCandidate[] = body.competitors.map((c: any) => {
      const threat = firstFiniteScore(
        c.finalThreatScore,
        c.threatScore,
        c.overallThreatScore,
        c.matchScore,
        c.substitutionScore,
      )
      const substitution = firstFiniteScore(
        c.substitutionScore,
        c.matchScore,
        c.finalThreatScore,
        c.threatScore,
      )
      return ({
      placeId: String(c.placeId || c.id || ''),
      name: String(c.brandName || c.name || c.displayName?.text || 'Restaurant'),
      address: String(c.formattedAddress || c.address || ''),
      distanceMi: Number.isFinite(Number(c.distanceMi)) ? Math.round(Number(c.distanceMi) * 100) / 100 : null,
      rating: Number.isFinite(Number(c.rating)) ? Number(c.rating) : null,
      reviewCount: Number.isFinite(Number(c.userRatingCount ?? c.reviewCount))
        ? Number(c.userRatingCount ?? c.reviewCount)
        : null,
      primaryType: String(c.primaryType || ''),
      types: Array.isArray(c.types) ? c.types : [],
      priceLevel: c.priceLevel ? String(c.priceLevel) : null,
      websiteUrl: c.websiteUri ? String(c.websiteUri) : c.websiteUrl ? String(c.websiteUrl) : null,
      discovery: ['universal_v3'],
      fitScore: substitution === null ? 0 : Math.round(substitution),
      classification: c.classification ? String(c.classification) : null,
      threatScore: threat === null ? null : Math.round(threat),
      competitiveStrengthScore: Number.isFinite(Number(c.competitiveStrengthScore))
        ? Math.round(Number(c.competitiveStrengthScore))
        : null,
      evidenceConfidenceLabel: c.evidenceConfidenceLabel ? String(c.evidenceConfidenceLabel) : null,
      ordering: null,
    })
    }).filter((c: BenchmarkCandidate) => c.placeId)
      .sort((a: BenchmarkCandidate, b: BenchmarkCandidate) => {
        const threatDelta = Number(b.threatScore ?? -1) - Number(a.threatScore ?? -1)
        if (threatDelta) return threatDelta
        const strengthDelta = Number(b.competitiveStrengthScore ?? -1) - Number(a.competitiveStrengthScore ?? -1)
        if (strengthDelta) return strengthDelta
        const confidenceDelta = confidenceRank(b.evidenceConfidenceLabel) - confidenceRank(a.evidenceConfidenceLabel)
        if (confidenceDelta) return confidenceDelta
        return Number(b.fitScore ?? 0) - Number(a.fitScore ?? 0)
      })
      .slice(0, 5)

    if (!rows.length) return null

    // Keep the growth audit's shallow ordering comparison, but only after the
    // real competitor engine has decided WHO belongs in the comparison set.
    const orderingRows = await Promise.all(
      rows.slice(0, 3).map((candidate) => shallowOrderingAudit(candidate)),
    )
    orderingRows.forEach((ordering, index) => {
      if (rows[index]) rows[index].ordering = ordering
    })

    const ratings = rows.map((c) => c.rating).filter((v): v is number => v !== null)
    const reviewCounts = rows.map((c) => c.reviewCount).filter((v): v is number => v !== null)
    const measuredOrdering = rows
      .map((candidate) => candidate.ordering)
      .filter((ordering) => ordering && ordering.status !== 'unavailable' && ordering.status !== 'unclear')

    const directCount = measuredOrdering.filter(
      (ordering) => ordering?.status === 'owned' || ordering?.status === 'branded_direct',
    ).length
    const marketplaceCount = measuredOrdering.filter(
      (ordering) => ordering?.status === 'marketplace',
    ).length

    const confidenceRows = rows
      .map((row) => String(row.evidenceConfidenceLabel || '').toLowerCase())
      .filter(Boolean)
    const confidence: CompetitorBenchmark['confidence'] =
      confidenceRows.filter((v) => v.includes('high')).length >= Math.ceil(rows.length / 2)
        ? 'high'
        : confidenceRows.length
          ? 'medium'
          : 'limited'

    // Publishing guardrail: keep the V3 output available internally, but only
    // show restaurant names to the owner when the dedicated engine itself
    // produced a strong, well-supported set. This is deliberately conservative:
    // a hidden benchmark is better than confidently naming weak substitutes.
    const strongThreats = rows.filter((row) => Number(row.threatScore ?? row.fitScore ?? 0) >= 70)
    const highEvidence = rows.filter((row) => confidenceRank(row.evidenceConfidenceLabel) >= 3)
    const veryStrongThreats = rows.filter((row) => Number(row.threatScore ?? row.fitScore ?? 0) >= 80)
    const presentationEligible =
      rows.length >= 3 &&
      strongThreats.length >= 3 &&
      (confidence === 'high' || highEvidence.length >= 3 || veryStrongThreats.length >= 3)

    return {
      status: rows.length >= 3 ? 'ready' : 'limited',
      source: 'universal_v3',
      engineVersion: body.engineVersion || body.policyVersion || '3.0',
      confidence,
      presentationEligible,
      query: String(body.competitiveModel?.summary || body.identity?.primary_identity || ''),
      radiusKm: Number(body.diagnostics?.effectiveRadiusKm || 5),
      // V3 already performed the expensive substitution/threat decision using
      // target DNA, occasion, price, format, geography and market strength.
      // Do NOT put the lightweight keyword sanity filter after it: names such
      // as "Goshi" or "Osmow's" can be excellent substitutes without exposing
      // their proposition in Google type/name strings.
      candidates: rows,
      summary: {
        medianRating: median(ratings),
        medianReviewCount: median(reviewCounts),
        directOrderingCount: measuredOrdering.length ? directCount : null,
        marketplaceOrderingCount: measuredOrdering.length ? marketplaceCount : null,
        orderingMeasuredCount: measuredOrdering.length,
      },
      error: null,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function buildCompetitorBenchmark(input: any, website: any): Promise<CompetitorBenchmark> {
  // The V3 substitution/threat engine is the only source that can call rows
  // direct competitors. If it is unavailable, retain useful Google Places
  // context but label it as local reference points in the report.
  const universal = await buildUniversalCompetitorBenchmark(input, website)
  if (universal) return universal
  const fallback = await buildLightweightCompetitorBenchmark(input, website)
  return {
    ...fallback,
    source: fallback.candidates.length ? 'local_fallback' : 'none',
    engineVersion: fallback.candidates.length ? 'places-fallback' : null,
    confidence: fallback.candidates.length >= 3 ? 'medium' : 'limited',
    presentationEligible: false,
    error: fallback.error ?? (fallback.candidates.length ? null : 'No local reference points were found.'),
  }
}
