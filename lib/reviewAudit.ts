import { debugError, debugLog } from '@/lib/debug'

/** Our own normalized review schema — Outscraper field names must never leak past this module. */
export type NormalizedGoogleReview = {
  id: string | null
  rating: number | null
  text: string
  createdAt: string | null
  createdTimestamp: number | null
  ownerResponded: boolean
  ownerResponse: string | null
  ownerRespondedAt: string | null
  ownerResponseTimestamp: number | null
  likes: number | null
}

export type ReviewMetrics = {
  sampleSize: number
  averageRatingInSample: number | null
  positiveReviews: number
  positiveRate: number | null
  neutralReviews: number
  neutralRate: number | null
  negativeReviews: number
  negativeRate: number | null
  /** Response metrics are null when owner-response data was not measured (e.g. Google Places fallback). */
  answeredReviews: number | null
  overallResponseRate: number | null
  negativeAnswered: number | null
  negativeResponseRate: number | null
  positiveAnswered: number | null
  positiveResponseRate: number | null
  unansweredNegativeReviews: number | null
  medianResponseTimeHours: number | null
  averageResponseTimeHours: number | null
  recentReviewCount30d: number
  recentReviewCount90d: number
}

export type ReviewTopicCategory = 'product' | 'service' | 'experience' | 'other'
export type ReviewTopicSentiment = 'positive' | 'negative' | 'neutral' | 'mixed'
export type ReviewTopicConfidence = 'limited' | 'medium' | 'high'

/** A repeated, rating-backed public signal. This is deterministic and never depends on an AI provider. */
export type ReviewTopic = {
  topic: string
  category: ReviewTopicCategory
  sentiment: ReviewTopicSentiment
  mentions: number
  positiveMentions: number
  negativeMentions: number
  neutralMentions: number
  confidence: ReviewTopicConfidence
  examples: string[]
}

export type ReviewAuditDiagnostics = {
  configured: boolean
  providerState:
    | 'ready'
    | 'google_baseline'
    | 'not_configured'
    | 'authentication'
    | 'billing'
    | 'validation'
    | 'timeout'
    | 'pending_timeout'
    | 'empty'
    | 'http_error'
    | 'exception'
  attempts: number
  requestLimits: number[]
  received: number
  usedGoogleFallback: boolean
}

export type ReviewAuditResult = {
  status: 'ready' | 'pending' | 'unavailable'
  source: 'outscraper' | 'google_places' | 'none'
  responseMeasured: boolean
  googleRating: number | null
  googleReviewCount: number | null
  metrics: ReviewMetrics | null
  sample: NormalizedGoogleReview[]
  topics: ReviewTopic[]
  error: string | null
  diagnostics: ReviewAuditDiagnostics
}

export type SectionScore = { earned: number | null; max: number; status: 'good' | 'warning' | 'bad' | 'unknown'; detail: string; evidence?: string[] }

const OUTSCRAPER_ENDPOINT = 'https://api.outscraper.com/google-maps-reviews'
// Single-attempt HTTP timeout. Interactive audits favor a smaller recent
// review sample; if Outscraper returns a pending job we poll briefly and retry
// once at lower depth before degrading to the Google reputation baseline.
const OUTSCRAPER_TIMEOUT_MS = 20000
const OUTSCRAPER_POLL_BUDGET_MS = 16000
const OUTSCRAPER_POLL_INTERVAL_MS = 2500
// Keep the review layer interactive while retaining enough repeated language
// for a useful product/service topic map. The retry stays smaller so a slow
// provider can still return a responsive audit instead of blocking all results.
const PRIMARY_REVIEW_LIMIT = 60
const RETRY_REVIEW_LIMIT = 30

// Pull the place record (and its reviews) out of any Outscraper response shape.
// Sync responses are `[place]` or `{ data: [place] }`; async/polled results are
// often double-nested as `{ data: [[place]] }`.
function extractPlace(body: any): any {
  let root = Array.isArray(body) ? body : body?.data
  if (Array.isArray(root) && Array.isArray(root[0])) root = root[0] // unwrap double-nesting
  return Array.isArray(root) ? root[0] : root
}

function reviewsFromPlace(place: any): any[] {
  if (Array.isArray(place?.reviews_data)) return place.reviews_data
  if (Array.isArray(place?.reviews)) return place.reviews
  return []
}

// Poll an Outscraper async job's results_location until reviews are ready or the
// budget is exhausted. Returns the parsed place record, or null on timeout.
async function pollOutscraper(resultsUrl: string, key: string): Promise<any | null> {
  const deadline = Date.now() + OUTSCRAPER_POLL_BUDGET_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, OUTSCRAPER_POLL_INTERVAL_MS))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), OUTSCRAPER_TIMEOUT_MS)
    try {
      const res = await fetch(resultsUrl, { headers: { 'X-API-KEY': key, Accept: 'application/json' }, signal: controller.signal })
      const body = await res.json().catch(() => null)
      const status = String((body as any)?.status ?? '').toLowerCase()
      if (status && status !== 'success' && status !== 'finished' && status !== 'completed') continue // still pending/in-progress
      const place = extractPlace(body)
      if (reviewsFromPlace(place).length) return place
    } catch {
      // transient poll failure — keep trying until the budget runs out
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

function toMs(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  // Outscraper timestamps are unix seconds; anything already in ms is left as-is.
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n)
}

function parseDateMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function num(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Normalize one raw Outscraper review into our schema, defensively across field-name variants. */
function normalizeOutscraperReview(raw: any): NormalizedGoogleReview {
  const createdTimestamp = toMs(raw?.review_timestamp) ?? parseDateMs(raw?.review_datetime_utc)
  const ownerResponse = (raw?.owner_answer ?? raw?.owner_answer_text ?? null) || null
  const ownerResponseTimestamp = toMs(raw?.owner_answer_timestamp) ?? parseDateMs(raw?.owner_answer_timestamp_datetime_utc)
  return {
    id: raw?.review_id ?? raw?.id ?? null,
    rating: num(raw?.review_rating ?? raw?.rating),
    text: String(raw?.review_text ?? raw?.text ?? '').trim(),
    createdAt: raw?.review_datetime_utc ?? null,
    createdTimestamp,
    ownerResponded: Boolean(ownerResponse),
    ownerResponse,
    ownerRespondedAt: raw?.owner_answer_timestamp_datetime_utc ?? null,
    ownerResponseTimestamp: ownerResponse ? ownerResponseTimestamp : null,
    likes: num(raw?.review_likes ?? raw?.likes),
  }
}

/** Normalize a Google Places (new API) review as an emergency fallback. No owner-response data is available here. */
export function normalizeGooglePlacesReview(raw: any): NormalizedGoogleReview {
  const createdTimestamp = parseDateMs(raw?.publishTime)
  return {
    id: raw?.name ?? null,
    rating: num(raw?.rating),
    text: String(raw?.text?.text ?? raw?.originalText?.text ?? '').trim(),
    createdAt: raw?.publishTime ?? null,
    createdTimestamp,
    ownerResponded: false,
    ownerResponse: null,
    ownerRespondedAt: null,
    ownerResponseTimestamp: null,
    likes: null,
  }
}

/** Deterministic review statistics. Never ask the LLM to compute these. */
export function computeReviewMetrics(reviews: NormalizedGoogleReview[], responseMeasured: boolean): ReviewMetrics {
  const rated = reviews.filter(r => typeof r.rating === 'number')
  const sampleSize = reviews.length
  const positive = rated.filter(r => (r.rating as number) >= 4)
  const neutral = rated.filter(r => (r.rating as number) === 3)
  const negative = rated.filter(r => (r.rating as number) <= 2)
  const averageRatingInSample = rated.length ? Math.round((rated.reduce((a, r) => a + (r.rating as number), 0) / rated.length) * 100) / 100 : null

  const now = Date.now()
  const day = 86400000
  const recentReviewCount30d = reviews.filter(r => r.createdTimestamp && now - r.createdTimestamp <= 30 * day).length
  const recentReviewCount90d = reviews.filter(r => r.createdTimestamp && now - r.createdTimestamp <= 90 * day).length

  let answeredReviews: number | null = null
  let overallResponseRate: number | null = null
  let negativeAnswered: number | null = null
  let negativeResponseRate: number | null = null
  let positiveAnswered: number | null = null
  let positiveResponseRate: number | null = null
  let unansweredNegativeReviews: number | null = null
  let medianResponseTimeHours: number | null = null
  let averageResponseTimeHours: number | null = null

  if (responseMeasured) {
    answeredReviews = reviews.filter(r => r.ownerResponded).length
    overallResponseRate = sampleSize ? answeredReviews / sampleSize : null
    negativeAnswered = negative.filter(r => r.ownerResponded).length
    // null (not zero) when there are no negatives in the sample — do not punish.
    negativeResponseRate = negative.length ? negativeAnswered / negative.length : null
    positiveAnswered = positive.filter(r => r.ownerResponded).length
    positiveResponseRate = positive.length ? positiveAnswered / positive.length : null
    unansweredNegativeReviews = negative.filter(r => !r.ownerResponded).length

    const responseHours = reviews
      .filter(r => r.ownerResponded && r.createdTimestamp && r.ownerResponseTimestamp && (r.ownerResponseTimestamp as number) >= (r.createdTimestamp as number))
      .map(r => ((r.ownerResponseTimestamp as number) - (r.createdTimestamp as number)) / 3600000)
    if (responseHours.length) {
      const sorted = [...responseHours].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      medianResponseTimeHours = Math.round((sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
      averageResponseTimeHours = Math.round((responseHours.reduce((a, h) => a + h, 0) / responseHours.length) * 10) / 10
    }
  }

  return {
    sampleSize,
    averageRatingInSample,
    positiveReviews: positive.length,
    positiveRate: rated.length ? positive.length / rated.length : null,
    neutralReviews: neutral.length,
    neutralRate: rated.length ? neutral.length / rated.length : null,
    negativeReviews: negative.length,
    negativeRate: rated.length ? negative.length / rated.length : null,
    answeredReviews,
    overallResponseRate,
    negativeAnswered,
    negativeResponseRate,
    positiveAnswered,
    positiveResponseRate,
    unansweredNegativeReviews,
    medianResponseTimeHours,
    averageResponseTimeHours,
    recentReviewCount30d,
    recentReviewCount90d,
  }
}

const TOPIC_STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'always', 'amazing', 'and', 'are', 'around', 'back', 'been', 'best', 'better', 'but', 'came', 'come', 'could', 'definitely', 'delicious', 'did', 'does', 'first', 'for', 'from', 'get', 'good', 'great', 'had', 'has', 'have', 'here', 'highly', 'just', 'like', 'love', 'loved', 'more', 'most', 'much', 'nice', 'not', 'our', 'place', 'really', 'restaurant', 'return', 'that', 'the', 'their', 'them', 'this', 'very', 'was', 'were', 'will', 'with', 'would', 'you', 'your',
])
const SERVICE_TERMS = new Set(['service', 'server', 'servers', 'waiter', 'waitress', 'wait', 'waiting', 'staff', 'manager', 'friendly', 'rude', 'host', 'cashier', 'customer'])
const EXPERIENCE_TERMS = new Set(['atmosphere', 'ambiance', 'ambience', 'music', 'clean', 'cleanliness', 'parking', 'location', 'crowded', 'noise', 'noisy', 'seating', 'decor'])
const GENERIC_PRODUCT_TERMS = new Set(['food', 'menu', 'dish', 'meal', 'portion', 'taste', 'flavor', 'flavour', 'quality', 'fresh', 'price', 'prices', 'value'])

type TopicAccumulator = {
  phrase: string
  category: ReviewTopicCategory
  ratings: number[]
  examples: string[]
}

function topicWords(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^'+|'+$/g, ''))
    .filter((word) => word.length >= 3 && !TOPIC_STOP_WORDS.has(word) && !/^\d+$/.test(word))
}

function topicCategory(words: string[]): ReviewTopicCategory {
  if (words.some((word) => SERVICE_TERMS.has(word))) return 'service'
  if (words.some((word) => EXPERIENCE_TERMS.has(word))) return 'experience'
  return 'product'
}

function titleTopic(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/**
 * Builds an honest public word/topic map without an LLM. Topics must repeat in
 * at least two distinct reviews, and callers should only publish it from a
 * sufficiently large Outscraper corpus. Review rating is the stable sentiment
 * anchor instead of guessing sentiment from isolated adjectives.
 */
export function buildReviewTopicMap(reviews: NormalizedGoogleReview[]): ReviewTopic[] {
  if (reviews.length < 5) return []

  const phrases = new Map<string, TopicAccumulator>()
  for (const review of reviews) {
    const words = topicWords(review.text)
    if (!words.length) continue
    const candidates = new Set<string>()

    for (const word of words) {
      if (!GENERIC_PRODUCT_TERMS.has(word) && !SERVICE_TERMS.has(word) && !EXPERIENCE_TERMS.has(word)) candidates.add(word)
    }
    for (let index = 0; index < words.length - 1; index += 1) {
      const pair = [words[index], words[index + 1]]
      if (pair.every((word) => GENERIC_PRODUCT_TERMS.has(word))) continue
      if (pair.some((word) => SERVICE_TERMS.has(word) || EXPERIENCE_TERMS.has(word)) || pair.some((word) => !GENERIC_PRODUCT_TERMS.has(word))) candidates.add(pair.join(' '))
    }

    for (const phrase of candidates) {
      const category = topicCategory(phrase.split(' '))
      const current = phrases.get(phrase) ?? { phrase, category, ratings: [], examples: [] }
      if (typeof review.rating === 'number') current.ratings.push(review.rating)
      if (review.text && current.examples.length < 2) current.examples.push(review.text.slice(0, 180))
      phrases.set(phrase, current)
    }
  }

  const confidence: ReviewTopicConfidence = reviews.length >= 20 ? 'high' : reviews.length >= 10 ? 'medium' : 'limited'
  return [...phrases.values()]
    .filter((entry) => entry.ratings.length >= 2)
    .map((entry) => {
      const positiveMentions = entry.ratings.filter((rating) => rating >= 4).length
      const negativeMentions = entry.ratings.filter((rating) => rating <= 2).length
      const neutralMentions = entry.ratings.filter((rating) => rating === 3).length
      const mentions = entry.ratings.length
      const sentiment: ReviewTopicSentiment = positiveMentions / mentions >= 0.7
        ? 'positive'
        : negativeMentions / mentions >= 0.5
          ? 'negative'
          : neutralMentions / mentions >= 0.6
            ? 'neutral'
            : 'mixed'
      return { topic: titleTopic(entry.phrase), category: entry.category, sentiment, mentions, positiveMentions, negativeMentions, neutralMentions, confidence, examples: entry.examples }
    })
    .sort((a, b) => b.mentions - a.mentions || b.negativeMentions - a.negativeMentions || a.topic.localeCompare(b.topic))
    .slice(0, 12)
}

/**
 * Fetch recent reviews from Outscraper for a Google Place ID, newest-first.
 * One low-depth retry is allowed only when the provider is slow/empty; auth,
 * billing and validation errors never retry. The audit itself never fails.
 */
export async function auditGoogleReviews(
  placeId: string,
  googleRating: number | null,
  googleReviewCount: number | null,
  fallbackReviews: NormalizedGoogleReview[] = [],
): Promise<ReviewAuditResult> {
  const key = process.env.OUTSCRAPER_API_KEY
  const requestLimits: number[] = []
  let attempts = 0

  const fallback = (
    providerState: ReviewAuditDiagnostics['providerState'],
    error: string | null,
  ): ReviewAuditResult => {
    const diagnostics: ReviewAuditDiagnostics = {
      configured: Boolean(key),
      providerState,
      attempts,
      requestLimits,
      received: 0,
      usedGoogleFallback: fallbackReviews.length > 0,
    }

    if (fallbackReviews.length) {
      const sample = fallbackReviews.slice(0, 5)
      // Google Places snippets preserve the verified rating/review baseline and
      // a little context. They never unlock response or precise sentiment scoring.
      return {
        status: 'ready',
        source: 'google_places',
        responseMeasured: false,
        googleRating,
        googleReviewCount,
        metrics: computeReviewMetrics(sample, false),
        sample,
        topics: [],
        error,
        diagnostics,
      }
    }

    return {
      status: 'unavailable',
      source: 'none',
      responseMeasured: false,
      googleRating,
      googleReviewCount,
      metrics: null,
      sample: [],
      topics: [],
      error,
      diagnostics,
    }
  }

  if (!key) {
    debugLog('reviews.outscraper', 'OUTSCRAPER_API_KEY not configured; using Google reputation baseline')
    return fallback('not_configured', null)
  }
  if (!placeId) return fallback('validation', 'Missing Google Place ID')

  type AttemptResult =
    | { ok: true; place: any; rawReviews: any[]; state: 'ready' }
    | {
        ok: false
        state:
          | 'authentication'
          | 'billing'
          | 'validation'
          | 'timeout'
          | 'pending_timeout'
          | 'empty'
          | 'http_error'
          | 'exception'
      }

  const runAttempt = async (limit: number): Promise<AttemptResult> => {
    attempts += 1
    requestLimits.push(limit)

    const params = new URLSearchParams({
      query: placeId,
      reviewsLimit: String(limit),
      sort: 'newest',
      async: 'false',
      source: 'google',
    })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), OUTSCRAPER_TIMEOUT_MS)

    try {
      const response = await fetch(`${OUTSCRAPER_ENDPOINT}?${params.toString()}`, {
        headers: { 'X-API-KEY': key, Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      })
      const status = response.status

      if (status === 401) {
        debugError('reviews.outscraper', 'Outscraper authentication failed', new Error('HTTP 401'))
        return { ok: false, state: 'authentication' }
      }
      if (status === 402) {
        debugError('reviews.outscraper', 'Outscraper billing/payment issue', new Error('HTTP 402'))
        return { ok: false, state: 'billing' }
      }
      if (status === 422) {
        const body = await response.json().catch(() => ({}))
        debugError('reviews.outscraper', 'Outscraper validation error', new Error('HTTP 422'), {
          providerMessage: typeof body?.error === 'string' ? body.error : undefined,
        })
        return { ok: false, state: 'validation' }
      }
      if (!response.ok && status !== 202) {
        debugError('reviews.outscraper', 'Outscraper request failed', new Error(`HTTP ${status}`))
        return { ok: false, state: 'http_error' }
      }

      const body = await response.json().catch(() => null)
      let place = extractPlace(body)
      let rawReviews = reviewsFromPlace(place)

      const bodyStatus = String((body as any)?.status ?? '').toLowerCase()
      const isPending =
        status === 202 ||
        (bodyStatus &&
          bodyStatus !== 'success' &&
          bodyStatus !== 'finished' &&
          bodyStatus !== 'completed')

      if (!rawReviews.length && isPending) {
        const resultsUrl =
          (body as any)?.results_location ||
          ((body as any)?.id ? `https://api.outscraper.com/requests/${(body as any).id}` : null)

        if (resultsUrl) {
          debugLog('reviews.outscraper', 'Outscraper pending; polling results', {
            resultsUrl,
            limit,
          })
          const polled = await pollOutscraper(resultsUrl, key)
          if (polled) {
            place = polled
            rawReviews = reviewsFromPlace(polled)
          }
        }

        if (!rawReviews.length) {
          debugLog('reviews.outscraper', 'Outscraper still pending after poll budget', { limit })
          return { ok: false, state: 'pending_timeout' }
        }
      }

      if (!rawReviews.length) {
        debugLog('reviews.outscraper', 'Outscraper returned no reviews', { limit })
        return { ok: false, state: 'empty' }
      }

      return { ok: true, place, rawReviews, state: 'ready' }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        debugError('reviews.outscraper', 'Outscraper request timed out', error, { limit })
        return { ok: false, state: 'timeout' }
      }
      debugError('reviews.outscraper', 'Outscraper request threw', error, { limit })
      return { ok: false, state: 'exception' }
    } finally {
      clearTimeout(timer)
    }
  }

  let attempt = await runAttempt(PRIMARY_REVIEW_LIMIT)

  // One controlled low-depth retry materially improves interactive reliability
  // without turning every audit into repeated paid scraping. Never retry auth,
  // billing or validation errors.
  if (
    !attempt.ok &&
    ['timeout', 'pending_timeout', 'empty', 'http_error', 'exception'].includes(attempt.state)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 400))
    attempt = await runAttempt(RETRY_REVIEW_LIMIT)
  }

  if (!attempt.ok) return fallback(attempt.state, attempt.state)

  const providerRating = num(attempt.place?.rating)
  const providerCount =
    typeof attempt.place?.reviews === 'number'
      ? attempt.place.reviews
      : num(attempt.place?.reviews_count)

  const sample = attempt.rawReviews.slice(0, PRIMARY_REVIEW_LIMIT).map(normalizeOutscraperReview)
  const metrics = computeReviewMetrics(sample, true)
  const topics = buildReviewTopicMap(sample)

  debugLog('reviews.outscraper', 'Outscraper reviews retrieved', {
    received: sample.length,
    attempts,
    requestLimits,
    negatives: metrics.negativeReviews,
    overallResponseRate: metrics.overallResponseRate,
    negativeResponseRate: metrics.negativeResponseRate,
    medianResponseTimeHours: metrics.medianResponseTimeHours,
    topics: topics.length,
  })

  return {
    status: 'ready',
    source: 'outscraper',
    responseMeasured: true,
    googleRating: googleRating ?? providerRating,
    googleReviewCount: googleReviewCount ?? providerCount,
    metrics,
    sample,
    topics,
    error: null,
    diagnostics: {
      configured: true,
      providerState: 'ready',
      attempts,
      requestLimits,
      received: sample.length,
      usedGoogleFallback: false,
    },
  }
}

function timelinessFraction(medianHours: number | null): number | null {
  if (medianHours === null) return null
  if (medianHours <= 24) return 1
  if (medianHours <= 72) return 0.7
  if (medianHours <= 168) return 0.4
  return 0.15
}

/** Review Response section (max 20): negative-response ~50%, overall ~30%, timeliness ~20%. */
export function scoreReviewResponse(result: ReviewAuditResult): SectionScore {
  const max = 20
  if (result.status === 'pending') return { earned: null, max, status: 'unknown', detail: 'Review-response depth is still being verified.' }
  if (!result.responseMeasured || !result.metrics) return { earned: null, max, status: 'unknown', detail: 'The public Google profile remains the reputation baseline for this run.' }

  const m = result.metrics
  // Very small samples produce volatile percentages. Keep the raw data, but do
  // not turn a handful of reviews into a confident management-behavior score.
  if (m.sampleSize < 10) {
    return {
      earned: null,
      max,
      status: 'unknown',
      detail: `Response behavior is based on only ${m.sampleSize} recent review${m.sampleSize === 1 ? '' : 's'} and is not used as a scored signal.`,
      evidence: [`${m.sampleSize} recent reviews observed`],
    }
  }

  const components: Array<{ weight: number; frac: number }> = []
  // A 0%/100% rate from one negative review is not stable enough to carry half
  // the response score. Require at least three negatives before it becomes a
  // primary weighted component.
  if (m.negativeResponseRate !== null && m.negativeReviews >= 3) {
    components.push({ weight: 0.5, frac: m.negativeResponseRate })
  }
  if (m.overallResponseRate !== null) components.push({ weight: 0.3, frac: m.overallResponseRate })
  const timeliness = timelinessFraction(m.medianResponseTimeHours)
  if (timeliness !== null) components.push({ weight: 0.2, frac: timeliness })

  if (!components.length) return { earned: null, max, status: 'unknown', detail: 'Not enough response evidence to score review engagement.' }

  const totalWeight = components.reduce((a, c) => a + c.weight, 0)
  const fraction = components.reduce((a, c) => a + c.weight * c.frac, 0) / totalWeight
  const earned = Math.round(max * fraction)
  const status: SectionScore['status'] = fraction >= 0.7 ? 'good' : fraction >= 0.35 ? 'warning' : 'bad'

  const evidence: string[] = []
  if (m.overallResponseRate !== null) evidence.push(`${Math.round(m.overallResponseRate * 100)}% overall owner-response rate`)
  if (m.negativeResponseRate !== null) evidence.push(`${Math.round(m.negativeResponseRate * 100)}% of negative reviews answered`)
  else if (m.negativeReviews === 0) evidence.push('No negative reviews in the recent sample (negative-response rate not applicable)')
  if (m.medianResponseTimeHours !== null) evidence.push(`Median response time ${m.medianResponseTimeHours} hrs`)
  if (typeof m.unansweredNegativeReviews === 'number' && m.unansweredNegativeReviews > 0) evidence.push(`${m.unansweredNegativeReviews} unanswered negative review(s)`)

  const detail = m.negativeReviews === 0
    ? `Owner responds to ${Math.round((m.overallResponseRate ?? 0) * 100)}% of recent reviews; no negatives to recover in this sample.`
    : `${Math.round((m.negativeResponseRate ?? 0) * 100)}% of recent negative reviews received an owner response.`
  return { earned, max, status, detail, evidence }
}

/** Customer Sentiment section (max 15): driven by the recent star-rating distribution. */
export function scoreSentiment(result: ReviewAuditResult): SectionScore {
  const max = 15
  if (!result.metrics || result.metrics.positiveRate === null || result.metrics.sampleSize === 0) {
    return { earned: null, max, status: 'unknown', detail: 'The overall Google rating remains the primary sentiment signal for this run.' }
  }
  const m = result.metrics

  // Google's Places review snippets are relevance-selected and tiny; they are
  // useful as supporting context, not a statistically credible "recent
  // sentiment" percentage. Require a larger Outscraper sample before scoring.
  if (result.source === 'google_places' || m.sampleSize < 10) {
    return {
      earned: null,
      max,
      status: 'unknown',
      detail: `Google rating and review volume are verified; the ${m.sampleSize}-review public snippet sample is not used to score sentiment.`,
      evidence: [
        `${m.sampleSize} public review snippets available`,
        'Sentiment percentage suppressed because the sample is too small or relevance-selected',
      ],
    }
  }

  const rate = m.positiveRate as number
  const earned = Math.round(max * rate)
  const status: SectionScore['status'] = rate >= 0.7 ? 'good' : rate >= 0.45 ? 'warning' : 'bad'
  const evidence = [
    `${Math.round(rate * 100)}% positive (4–5★) across ${m.sampleSize} recent reviews`,
    `${Math.round((m.negativeRate ?? 0) * 100)}% negative (1–2★)`,
  ]
  return {
    earned,
    max,
    status,
    detail: `${Math.round(rate * 100)}% of the recent ${m.sampleSize}-review sample was positive.`,
    evidence,
  }
}
