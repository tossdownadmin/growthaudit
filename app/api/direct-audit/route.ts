import { NextRequest, NextResponse } from 'next/server'
import { inspectHtml, fetchPageSpeed, fetchWebsiteHtml, type RestaurantInput } from '@/lib/audit'
import { auditSocialProfiles, extractSocialLinks, scoreSocial, type DiscoveredSocials } from '@/lib/social'
import { auditGoogleReviews, normalizeGooglePlacesReview, scoreReviewResponse, scoreSentiment, type ReviewAuditResult } from '@/lib/reviewAudit'
import { debugError, debugLog, elapsed, startedAt } from '@/lib/debug'
import { scoreGrowthEngine, fallbackGrowthInterpretation } from '@/lib/growthEngine'
import { buildCompetitorBenchmark, type CompetitorBenchmark } from '@/lib/competitorBenchmark'
import { callModel, aiConfigured, aiProvider } from '@/lib/aiClient'

export const maxDuration = 120
export const runtime = 'nodejs'

// Walk the /v1/responses output array to recover text if output_text is absent.
function extractResponseText(data: any): string | null {
  const out = data?.output
  if (!Array.isArray(out)) return null
  const parts: string[] = []
  for (const item of out) {
    const content = item?.content
    if (Array.isArray(content)) {
      for (const c of content) {
        if (typeof c?.text === 'string') parts.push(c.text)
      }
    }
  }
  return parts.length ? parts.join('') : null
}

// Recover a JSON object from model text that may be fenced (```json ... ```),
// prefixed with prose, or otherwise decorated. Returns null if nothing parses.
function parseModelJson(text: string): Record<string, any> | null {
  const attempts: string[] = []
  const trimmed = String(text).trim()
  attempts.push(trimmed)
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) attempts.push(fence[1].trim())
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first !== -1 && last > first) attempts.push(trimmed.slice(first, last + 1))
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      // try next candidate
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  const started = startedAt()
  try {
    const input = (await req.json()) as RestaurantInput
    const hasOutscraper = Boolean(process.env.OUTSCRAPER_API_KEY)
    const hasOpenAi = aiConfigured()
    const pageSpeedKey = process.env.GOOGLE_PLACES_API_KEY
    const socialKey = (process.env.SOCIALCRAWL_API_KEY || '').trim()
    let aiDiagnostic: 'used' | 'fallback' | 'not_configured' | 'failed' =
      hasOpenAi ? 'fallback' : 'not_configured'
    debugLog('direct-audit', 'Audit request received', {
      placeId: input.placeId,
      hasWebsite: Boolean(input.websiteUrl),
      outscraperConfigured: hasOutscraper,
      openAiConfigured: hasOpenAi,
      pageSpeedConfigured: Boolean(pageSpeedKey),
      // Presence + length only — never the secret itself. If socialCrawlConfigured
      // is false here, the deployment is missing SOCIALCRAWL_API_KEY (redeploy needed).
      socialCrawlConfigured: socialKey.length > 0,
      socialCrawlKeyLength: socialKey.length,
      aiModel: process.env.DIRECT_AUDIT_AI_MODEL ?? 'not set',
    })
    if (!input.placeId || !input.name) return NextResponse.json({ error: 'Restaurant identity is required.' }, { status: 400 })
    let website: any = { reachable: null, https: null, title: null, meta: null, h1: null, canonical: null, schema: null, performance: null, seo: null, directPaths: [], ordering: null, customerPaths: {}, tracking: {}, htmlAvailable: null, htmlSource: 'none', fetchError: null, finalUrl: null, metaTags: {}, headings: { h1: [], h2: [] }, links: { internal: null, external: null, nofollow: null }, resources: { scripts: null, stylesheets: null, images: null, fonts: null }, performanceSignals: { htmlBytes: null, hasViewport: null, renderBlockingScripts: null, renderBlockingStyles: null, lazyImages: null, modernImageFormats: null, thirdPartyHosts: [] } }
    let discoveredSocials: DiscoveredSocials = {}
    if (input.websiteUrl) {
      try {
        const websiteStarted = Date.now()
        const fetched = await fetchWebsiteHtml(input.websiteUrl)

        if (fetched.html) {
          const html = fetched.html.slice(0, 1500000)
          discoveredSocials = extractSocialLinks(html, fetched.finalUrl || input.websiteUrl)
          website = {
            ...inspectHtml(html, fetched.finalUrl || input.websiteUrl),
            reachable: true,
            statusCode: fetched.statusCode,
            responseMs: fetched.responseMs ?? Date.now() - websiteStarted,
            contentBytes: fetched.contentBytes,
            htmlAvailable: true,
            htmlSource: fetched.source,
            fetchError: null,
            finalUrl: fetched.finalUrl || input.websiteUrl,
          }
          debugLog('direct-audit.website', 'Website inspection completed', {
            status: fetched.statusCode,
            reachable: true,
            htmlSource: fetched.source,
            duration: elapsed(started),
          })
        } else {
          website = {
            ...website,
            reachable: fetched.statusCode ? fetched.statusCode >= 200 && fetched.statusCode < 400 : null,
            statusCode: fetched.statusCode,
            responseMs: fetched.responseMs,
            contentBytes: fetched.contentBytes,
            htmlAvailable: false,
            htmlSource: 'none',
            fetchError: fetched.error,
            finalUrl: fetched.finalUrl || input.websiteUrl,
            https: (fetched.finalUrl || input.websiteUrl).startsWith('https://'),
          }
          debugError('direct-audit.website', 'Website HTML unavailable', new Error(fetched.error || 'HTML unavailable'), {
            url: input.websiteUrl,
            status: fetched.statusCode,
          })
        }
      } catch (error) {
        website.htmlAvailable = false
        website.fetchError = error instanceof Error ? error.message : 'Website inspection failed'
        debugError('direct-audit.website', 'Website inspection failed', error, { url: input.websiteUrl })
      }
    }
    // PageSpeed, social, and reviews are independent once the site HTML is
    // fetched, so run them CONCURRENTLY. Running them sequentially previously
    // stacked their timeouts (PSI + social + reviews + AI) past maxDuration and
    // produced 504s. Each phase already isolates its own failures.
    const confirmedSocials: DiscoveredSocials = Object.fromEntries(
      Object.entries(input.socials || {}).filter(([, value]) => Boolean(value)),
    ) as DiscoveredSocials
    const googleRating = input.rating ?? null
    const googleReviewCount = input.reviewCount ?? null
    const placesFallback = Array.isArray(input.reviews) ? input.reviews.map(normalizeGooglePlacesReview) : []

    const pageSpeedPhase = (async () => {
      if (!input.websiteUrl || !pageSpeedKey) { if (!pageSpeedKey) debugLog('direct-audit.pagespeed', 'PageSpeed key unavailable; skipping Lighthouse metrics'); return }
      const psiStarted = Date.now()
      const [mobile, desktop] = await Promise.all([
        fetchPageSpeed(input.websiteUrl, 'mobile', pageSpeedKey).catch(error => { debugError('direct-audit.pagespeed', 'PageSpeed mobile run failed', error, { url: input.websiteUrl }); return null }),
        fetchPageSpeed(input.websiteUrl, 'desktop', pageSpeedKey).catch(error => { debugError('direct-audit.pagespeed', 'PageSpeed desktop run failed', error, { url: input.websiteUrl }); return null }),
      ])
      website.pageSpeed = { mobile, desktop }
      if (mobile || desktop) {
        const psi = mobile || desktop
        website.reachable = true
        website.finalUrl = website.finalUrl || psi?.finalUrl || input.websiteUrl
        if (website.https === null || website.https === undefined) {
          website.https = String(website.finalUrl || input.websiteUrl).startsWith('https://')
        }
        if (typeof (mobile?.performance ?? desktop?.performance) === 'number') website.performance = mobile?.performance ?? desktop?.performance
        if (typeof (mobile?.seo ?? desktop?.seo) === 'number') website.seo = mobile?.seo ?? desktop?.seo

        if (website.htmlAvailable === false) {
          const checks = mobile?.seoChecks || desktop?.seoChecks
          if (checks?.documentTitle === true) website.title = true
          if (checks?.metaDescription === true) website.meta = true
          if (checks?.viewport === true) website.performanceSignals.hasViewport = true
        }
      }
      debugLog('direct-audit.pagespeed', 'PageSpeed runs completed', { mobilePerformance: mobile?.performance ?? null, desktopPerformance: desktop?.performance ?? null, mobileField: mobile?.fieldData ?? null, htmlAvailable: website.htmlAvailable, duration: `${Date.now() - psiStarted}ms` })
    })()

    const socialPhase = (async (): Promise<any> => {
      try {
        const socialStarted = Date.now()
        const result = await auditSocialProfiles(confirmedSocials, discoveredSocials)
        debugLog('direct-audit.social', 'Social audit completed', {
          configured: result.configured,
          discovered: Object.keys(result.discovered),
          analyzed: result.log.map((entry: any) => ({ platform: entry.platform, ok: entry.ok, error: entry.error })),
          duration: `${Date.now() - socialStarted}ms`,
        })
        return result
      } catch (error) {
        debugError('direct-audit.social', 'Social audit failed; continuing without it', error)
        return { configured: Boolean(process.env.SOCIALCRAWL_API_KEY), discovered: discoveredSocials, profiles: [], log: [] }
      }
    })()

    const benchmarkPhase = (async (): Promise<CompetitorBenchmark> => {
      try {
        const benchmarkStarted = Date.now()
        const result = await buildCompetitorBenchmark(input, website)
        debugLog('direct-audit.benchmark', 'Local benchmark completed', {
          status: result.status,
          query: result.query,
          candidates: result.candidates.map((candidate: any) => candidate.name),
          duration: `${Date.now() - benchmarkStarted}ms`,
        })
        return result
      } catch (error) {
        debugError('direct-audit.benchmark', 'Local benchmark failed; continuing without it', error)
        return {
          status: 'unavailable',
          source: 'none',
          engineVersion: null,
          confidence: 'limited',
          presentationEligible: false,
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
          error: 'Local benchmark failed.',
        }
      }
    })()

    const reviewPhase = (async (): Promise<ReviewAuditResult> => {
      try {
        const reviewStarted = Date.now()
        const result = await auditGoogleReviews(input.placeId, googleRating, googleReviewCount, placesFallback)
        debugLog('direct-audit.reviews', 'Review audit completed', { status: result.status, source: result.source, sampleSize: result.metrics?.sampleSize ?? 0, negatives: result.metrics?.negativeReviews ?? null, overallResponseRate: result.metrics?.overallResponseRate ?? null, negativeResponseRate: result.metrics?.negativeResponseRate ?? null, medianResponseTimeHours: result.metrics?.medianResponseTimeHours ?? null, duration: `${Date.now() - reviewStarted}ms` })
        return result
      } catch (error) {
        debugError('direct-audit.reviews', 'Review audit failed; continuing without it', error)
        return {
          status: 'unavailable',
          source: 'none',
          responseMeasured: false,
          googleRating,
          googleReviewCount,
          metrics: null,
          sample: [],
          topics: [],
          error: 'failed',
          diagnostics: {
            configured: hasOutscraper,
            providerState: 'exception',
            attempts: 0,
            requestLimits: [],
            received: 0,
            usedGoogleFallback: false,
          },
        }
      }
    })()

    const [, social, review, benchmark] = await Promise.all([pageSpeedPhase, socialPhase, reviewPhase, benchmarkPhase])

    const socialSection = scoreSocial({ ...discoveredSocials, ...confirmedSocials }, social.profiles)
    const reviewResponseSection = scoreReviewResponse(review)
    const sentimentSection = scoreSentiment(review)
    const result = scoreGrowthEngine({
      input,
      website,
      socialSection,
      reviewResponseSection,
      sentimentSection,
      reviews: review,
      benchmark,
    })
    let interpretation = fallbackGrowthInterpretation(result, benchmark)
    if (hasOpenAi) {
      try {
        const socialEvidence = {
          configured: social.configured,
          discovered: social.discovered,
          profiles: social.profiles,
        }
        const reviewEvidence = {
          status: review.status,
          source: review.source,
          responseMeasured: review.responseMeasured,
          googleRating: review.googleRating,
          googleReviewCount: review.googleReviewCount,
          metrics: review.metrics,
          topics: review.topics,
          // Compact sample only — never one call per review. Truncate text to control tokens.
          sample: review.sample.slice(0, 50).map(r => ({ rating: r.rating, text: r.text.slice(0, 320), createdAt: r.createdAt, ownerResponded: r.ownerResponded, ownerResponse: r.ownerResponse ? r.ownerResponse.slice(0, 320) : null })),
        }
        const prompt = [
          'Interpret this deterministic evidence as a RESTAURANT GROWTH ENGINE AUDIT for a North American restaurant owner.',
          'North star: make restaurants smarter by showing whether they can ATTRACT customers, CONVERT them directly, RETAIN them, ENGAGE them, and MEASURE what is working.',
          'This is not a generic SEO report and not a software checklist. The owner should understand where growth is leaking and what to fix first.',
          'The five scored pillars are already deterministic: Website + Ordering, Reputation & Reviews, Getting Customers Back, Staying Connected, Knowing What Works. Do not recompute or contradict the scores.',
          'ORDERING: distinguish owned/branded ordering from marketplace handoff. If ordering points mainly to DoorDash/Uber Eats/Grubhub/etc, explain that the restaurant can get the transaction while owning less of the customer relationship. Do not overstate ownership when the evidence says unclear.',
          'REPUTATION + REVIEWS: treat Google rating and total review volume as the authoritative reputation baseline. Only use recent sentiment percentages, response rates, response quality, themes, or service-recovery conclusions when reviews.source is not google_places AND reviews.metrics.sampleSize >= 10. A 5-review Google Places snippet sample is illustrative only and must not drive precise percentages or themes.',
          'SOCIAL: posting recency/frequency/engagement are engagement signals, not vanity metrics. Use exact posting frequency only when postsAnalyzed >= 4, evidenceConfidence >= 0.55, and the weekly cadence is <= 14. Use an exact engagement percentage only when postsAnalyzed >= 10, followers >= 300, evidenceConfidence >= 0.65, and the rate is <= 10%. Otherwise describe activity directionally. Absolute followers are informational only. Never invent follower growth.',
          'RETENTION: publicly detected loyalty, account, email, SMS, WhatsApp, app, and direct-order paths are evidence of a repeat-customer system. Absence means "not detected publicly", not proof that internal CRM does not exist.',
          'MEASUREMENT: public analytics/pixels show measurement readiness, but never claim we can see private reporting quality.',
          'PAID MEDIA: paid media is fuel, not the engine. Use result.paidMediaReadiness exactly as a readiness signal. If the engine is not ready, explain the leaks to fix before aggressively buying traffic.',
          'Return concise JSON with: maturityStage, executiveSummary, primaryLeak, priorities (3 owner-friendly actions), growthStory, paidMediaReadinessSummary, competitorSummary, pillarSummaries {websiteOrdering,reputation,retention,engagement,measurement}, strengths, socialSummary, journey {attract,convert,retain,grow}, missingEvidence, confidence, and the existing review fields positiveThemes[], negativeThemes[], mixedThemes[], recurringPraise[], recurringComplaints[], serviceRecoveryAssessment, ownerResponseQuality (strong|adequate|generic|weak|insufficient_evidence), reviewRelationshipSummary, topReviewOpportunity, reviewThemes[] ({theme, sentiment, mentions, summary}).',
          'Good language sounds like: "You are winning attention, but the customer journey leaks after the first order." "Your main order CTA sends guests to a marketplace." "Your reputation is strong, but nearby alternatives have deeper review proof." "Social attention is active, but there is no visible repeat-customer capture path."',
          'Avoid jargon and generic advice. Do not mention canonical tags or pixels in the executive summary unless they materially explain a growth problem. Technical evidence can remain lower in the report.',
          'CRITICAL: respond with ONLY the raw JSON object. No markdown, no code fences, no commentary before or after.',
          `Evidence: ${JSON.stringify({ input, result, website, social: socialEvidence, reviews: reviewEvidence })}`,
        ].join('\n')
        // Provider-agnostic model call. Same prompt, but routed through
        // callModel so the deployment can run on OpenAI, Anthropic, or (with no
        // key at all) fall back to the deterministic interpretation below.
        // callModel never throws: a dead/out-of-credit key returns {ok:false}.
        const modelRes = await callModel({
          prompt,
          maxTokens: 1600,
          timeoutMs: 40000,
          json: true,
        })
        if (!modelRes.ok) {
          aiDiagnostic = 'fallback'
          debugLog('direct-audit.ai', 'Model unavailable; using deterministic interpretation', { reason: modelRes.reason })
        } else {
          // Models frequently wrap JSON in ```json fences or add prose, which
          // broke JSON.parse and silently dropped ALL AI themes. Recover the
          // JSON object defensively from whatever text we get.
          const parsed = parseModelJson(modelRes.text)
          if (parsed) {
            interpretation = { ...interpretation, ...parsed }
            aiDiagnostic = 'used'
            debugLog('direct-audit.ai', 'AI interpretation completed', {
              duration: elapsed(started),
              themes: Array.isArray((parsed as any).reviewThemes) ? (parsed as any).reviewThemes.length : 0,
            })
          } else {
            aiDiagnostic = 'failed'
            debugError('direct-audit.ai', 'AI response contained no parseable JSON', new Error('parse_failed'), { preview: String(modelRes.text).slice(0, 200) })
          }
        }
      } catch (error) {
        aiDiagnostic = 'fallback'
        debugError('direct-audit.ai', 'Model request failed; using deterministic interpretation', error)
      }
    } else debugLog('direct-audit.ai', 'AI provider unavailable; using deterministic interpretation')
    debugLog('direct-audit', 'Audit completed', { score: result.score, reviewStatus: review.status, reviewSource: review.source, socialProfiles: social.profiles.length, benchmarkStatus: benchmark.status, duration: elapsed(started) })
    debugLog('direct-audit.health', 'Provider health', {
      website: {
        htmlAvailable: website.htmlAvailable,
        htmlSource: website.htmlSource,
        pageSpeedMobile: Boolean(website?.pageSpeed?.mobile),
        pageSpeedDesktop: Boolean(website?.pageSpeed?.desktop),
      },
      reviews: review.diagnostics,
      social: {
        configured: social.configured,
        discoveredCount: Object.keys(social.discovered || {}).length,
        successfulPlatforms: (social.log || []).filter((entry: any) => entry.ok).map((entry: any) => entry.platform),
        failedPlatforms: (social.log || []).filter((entry: any) => !entry.ok).map((entry: any) => ({ platform: entry.platform, error: entry.error })),
      },
      competitors: {
        source: benchmark.source,
        status: benchmark.status,
        candidateCount: benchmark.candidates?.length ?? 0,
        presentationEligible: benchmark.presentationEligible === true,
      },
      ai: aiDiagnostic,
    })
    return NextResponse.json({
      restaurant: input,
      website,
      result,
      interpretation,
      reviews: {
        status: review.status,
        source: review.source,
        responseMeasured: review.responseMeasured,
        googleRating: review.googleRating,
        googleReviewCount: review.googleReviewCount,
        metrics: review.metrics,
        topics: review.topics,
        // A few high-signal, truncated examples for the UI — never the full review corpus.
        examples: review.sample.slice(0, 3).map(r => ({ rating: r.rating, text: r.text.slice(0, 240), createdAt: r.createdAt, ownerResponded: r.ownerResponded })),
      },
      benchmark,
      // Internal QA only. The report UI intentionally does not render provider
      // failures or missing-evidence plumbing. This object lets us inspect a
      // deployed audit and immediately see which upstream source succeeded,
      // degraded to a baseline, or needs attention.
      diagnostics: {
        website: {
          htmlAvailable: website.htmlAvailable,
          htmlSource: website.htmlSource,
          reachable: website.reachable,
          pageSpeedMobile: Boolean(website?.pageSpeed?.mobile),
          pageSpeedDesktop: Boolean(website?.pageSpeed?.desktop),
        },
        reviews: review.diagnostics,
        social: {
          configured: social.configured,
          discoveredCount: Object.keys(social.discovered || {}).length,
          analyzed: (social.log || []).map((entry: any) => ({
            platform: entry.platform,
            ok: entry.ok,
            error: entry.error,
          })),
        },
        competitors: {
          source: benchmark.source,
          status: benchmark.status,
          engineVersion: benchmark.engineVersion ?? null,
          confidence: benchmark.confidence ?? null,
          candidateCount: benchmark.candidates?.length ?? 0,
          presentationEligible: benchmark.presentationEligible === true,
          error: benchmark.error ?? null,
        },
        ai: {
          configured: hasOpenAi,
          status: aiDiagnostic,
        },
      },
      social: {
        configured: social.configured,
        discovered: social.discovered,
        profiles: social.profiles,
        brandAssets: (input as any).brandAssets ?? [],
        // Runtime diagnostics so the deployed report can explain itself without
        // a separate endpoint. keyPresent reflects the ACTUAL runtime env of the
        // deployment serving this audit — if false, the key isn't set in the
        // environment this app is deployed to (add it there and redeploy).
        diagnostics: {
          keyPresent: socialKey.length > 0,
          keyLength: socialKey.length,
          discoveredCount: Object.keys(social.discovered || {}).length,
          analyzed: (social.log || []).map((entry: any) => ({ platform: entry.platform, ok: entry.ok, error: entry.error })),
        },
      },
    })
  } catch (error) { debugError('direct-audit', 'Audit failed unexpectedly', error, { duration: elapsed(started) }); return NextResponse.json({ error: 'Audit could not be completed.' }, { status: 500 }) }
}
