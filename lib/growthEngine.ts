// RESTAURANT GROWTH ENGINE — V1
//
// Converts the audit's raw, deterministic evidence into five restaurant-owner
// questions. Missing evidence stays unknown and is excluded from the score.

export type GrowthStatus = 'good' | 'warning' | 'bad' | 'unknown'

export type GrowthSection = {
  key: 'websiteOrdering' | 'reputation' | 'retention' | 'engagement' | 'measurement'
  label: string
  question: string
  score: number | null
  weight: number
  coverage: number
  earned: number | null
  max: number
  status: GrowthStatus
  summary: string
  evidence: string[]
}

type Signal = {
  score: number | null
  weight: number
  evidence?: string
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

function sectionScore(signals: Signal[]) {
  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0) || 100
  const known = signals.filter((signal) => signal.score !== null)
  const knownWeight = known.reduce((sum, signal) => sum + signal.weight, 0)

  if (!knownWeight) {
    return {
      score: null,
      coverage: 0,
      evidence: signals.map((s) => s.evidence).filter(Boolean) as string[],
    }
  }

  const score = Math.round(
    known.reduce((sum, signal) => sum + clamp(Number(signal.score)) * signal.weight, 0) /
      knownWeight,
  )

  return {
    score: clamp(score),
    coverage: Math.round((knownWeight / totalWeight) * 100),
    evidence: signals.map((s) => s.evidence).filter(Boolean) as string[],
  }
}

function statusFor(score: number | null, coverage = 100): GrowthStatus {
  if (score === null || coverage < 25) return 'unknown'

  // A high score is not allowed to look like a clean pass when most of the
  // underlying evidence is missing. This keeps confidence separate from
  // performance and prevents "90/100" on half-measured evidence from rendering
  // as a green result.
  if (score >= 75 && coverage >= 70) return 'good'
  if (score < 50) return 'bad'
  return 'warning'
}

function normSection(input: {
  key: GrowthSection['key']
  label: string
  question: string
  weight: number
  signals: Signal[]
  summary: (score: number | null) => string
  minCoverageForScore?: number
}): GrowthSection {
  const scored = sectionScore(input.signals)
  const minimumCoverage = input.minCoverageForScore ?? 0
  const publishedScore =
    scored.coverage >= minimumCoverage ? scored.score : null
  return {
    key: input.key,
    label: input.label,
    question: input.question,
    score: publishedScore,
    weight: input.weight,
    coverage: scored.coverage,
    earned:
      publishedScore === null
        ? null
        : Math.round((publishedScore / 100) * input.weight),
    max: input.weight,
    status: statusFor(publishedScore, scored.coverage),
    summary: input.summary(publishedScore),
    evidence: scored.evidence,
  }
}

function normalizedProviderSection(section: any): number | null {
  if (!section || section.earned === null || section.earned === undefined) return null
  const max = Number(section.max || 0)
  if (!max) return null
  return clamp((Number(section.earned) / max) * 100)
}

function ratingScore(rating: number | null | undefined) {
  if (rating === null || rating === undefined || !Number.isFinite(Number(rating))) return null
  // A 3.5 is a serious trust problem; 4.8+ is elite. This deliberately avoids
  // treating every 4.x rating as equivalent.
  return clamp(((Number(rating) - 3.5) / 1.3) * 100)
}

function competitorRatingScore(target: number | null, median: number | null) {
  if (target === null || median === null) return null
  return clamp(70 + (target - median) * 150)
}

function competitorReviewVolumeScore(target: number | null, median: number | null) {
  if (target === null || median === null || target < 0 || median <= 0) return null
  const ratio = Math.max(0.05, target / median)
  return clamp(70 + Math.log2(ratio) * 25)
}

function orderingScore(ordering: any) {
  const status = ordering?.status
  if (!status) return null
  if (status === 'owned') return 100
  if (status === 'branded_direct') return 88
  if (status === 'mixed') return 62
  if (status === 'marketplace') return 28
  if (status === 'unclear') return 42
  if (status === 'none') return 0
  return null
}

function normalizeWebsite(raw: string | null | undefined) {
  if (!raw) return ''
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return String(raw).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
  }
}

function googleWebsiteSignal(input: any) {
  const gmb = String(input?.googleWebsiteUrl || '')
  const confirmed = String(input?.websiteUrl || '')
  if (!gmb) {
    return {
      score: 0,
      evidence: 'No website is attached to the selected Google profile.',
    }
  }
  if (confirmed && normalizeWebsite(gmb) !== normalizeWebsite(confirmed)) {
    return {
      score: 40,
      evidence: 'The website confirmed for this audit does not match the website currently linked from Google.',
    }
  }
  return {
    score: 100,
    evidence: 'Google points customers to the confirmed restaurant website.',
  }
}

function searchReadinessScore(input: any, website: any) {
  if (!input?.websiteUrl) return 0
  if (website?.htmlAvailable === false) {
    const psi = website?.pageSpeed?.mobile ?? website?.pageSpeed?.desktop
    const checks = psi?.seoChecks
    if (!checks) return null
    const values = [
      checks.documentTitle,
      checks.metaDescription,
      checks.viewport,
      checks.crawlable,
    ].filter((v) => v !== null && v !== undefined)
    if (!values.length) return null
    return Math.round((values.filter(Boolean).length / values.length) * 100)
  }

  const values = [
    Boolean(website?.metaTags?.title),
    Boolean(website?.metaTags?.description),
    Boolean(website?.metaTags?.canonical),
    Boolean(website?.schema),
    Boolean(website?.performanceSignals?.hasViewport),
  ]
  return Math.round((values.filter(Boolean).length / values.length) * 100)
}

function trackingScore(website: any) {
  if (!website?.reachable) return website?.reachable === false ? 0 : null
  if (website?.htmlAvailable === false) return null

  const tracking = website?.tracking ?? {}
  const analytics = Boolean(tracking.ga4 || tracking.gtm)
  const paidSignals = [
    tracking.metaPixel,
    tracking.googleAds,
    tracking.tiktokPixel,
  ].filter(Boolean).length
  const search = searchReadinessScore({ websiteUrl: website?.finalUrl || 'present' }, website)

  let score = 0
  score += analytics ? 45 : 0
  score += paidSignals >= 2 ? 35 : paidSignals === 1 ? 25 : 0
  score += search === null ? 0 : (search / 100) * 20
  return clamp(Math.round(score))
}

function conversionPathScore(website: any) {
  if (website?.reachable === false) return 0
  if (website?.htmlAvailable === false) return null
  const paths = website?.customerPaths ?? {}
  let score = 0
  if (paths.menu) score += 45
  if (paths.directContact) score += 30
  if (paths.reservation) score += 15
  if (paths.ordering) score += 10
  return clamp(score)
}

function retentionSignalsScoreMap(website: any) {
  if (website?.reachable === false) {
    return {
      loyalty: 0,
      account: 0,
      email: 0,
      messaging: 0,
      app: 0,
      ordering: 0,
    }
  }
  if (website?.htmlAvailable === false) {
    return {
      loyalty: null,
      account: null,
      email: null,
      messaging: null,
      app: null,
      ordering: orderingScore(website?.ordering),
    }
  }
  const p = website?.customerPaths ?? {}
  return {
    loyalty: p.loyalty ? 100 : 0,
    account: p.account ? 100 : 0,
    email: p.emailCapture ? 100 : 0,
    messaging: p.smsCapture || p.whatsapp ? 100 : 0,
    app: p.app ? 100 : 0,
    ordering: orderingScore(website?.ordering),
  }
}

export function scoreGrowthEngine(args: {
  input: any
  website: any
  socialSection: any
  reviewResponseSection: any
  sentimentSection: any
  reviews: any
  benchmark?: any
}) {
  const { input, website, socialSection, reviewResponseSection, sentimentSection, reviews, benchmark } = args

  const ordering = website?.ordering
  const orderingOwnership = orderingScore(ordering)
  const googleWebsite = googleWebsiteSignal(input)
  const psiPerf =
    website?.pageSpeed?.mobile?.performance ??
    website?.pageSpeed?.desktop?.performance ??
    website?.performance ??
    null

  const websiteOrdering = normSection({
    key: 'websiteOrdering',
    label: 'Website + Ordering',
    question: 'Can customers easily buy from you directly?',
    weight: 25,
    signals: [
      {
        score: googleWebsite.score,
        weight: 10,
        evidence: googleWebsite.evidence,
      },
      {
        score: input.websiteUrl
          ? website?.reachable === null || website?.reachable === undefined
            ? null
            : website.reachable
              ? 100
              : 0
          : 0,
        weight: 15,
        evidence:
          website?.reachable === true
            ? 'Website is reachable.'
            : website?.reachable === false
              ? 'Website could not be reached.'
              : 'Website reachability was not measured.',
      },
      {
        score: typeof psiPerf === 'number' ? psiPerf : null,
        weight: 15,
        evidence:
          typeof psiPerf === 'number'
            ? `Mobile/customer-facing performance signal: ${Math.round(psiPerf)}/100.`
            : 'Page speed was not measured.',
      },
      {
        score: orderingOwnership,
        weight: 45,
        evidence:
          ordering?.summary ||
          (orderingOwnership === null ? 'Ordering path was not measured.' : 'No online ordering path was detected.'),
      },
      {
        score: conversionPathScore(website),
        weight: 15,
        evidence:
          website?.htmlAvailable === false
            ? 'Menu/contact conversion paths were not measured from HTML.'
            : `Observed customer paths: ${Object.entries(website?.customerPaths ?? {})
                .filter(([, value]) => Boolean(value))
                .map(([key]) => key)
                .join(', ') || 'none detected'}.`,
      },
    ],
    summary: (score) => {
      if (score === null) return 'No website-and-ordering score is published from the available public evidence.'
      if (ordering?.status === 'marketplace')
        return 'Customers can order, but the main ordering path appears to hand the transaction to a third-party marketplace.'
      if (ordering?.status === 'owned' || ordering?.status === 'branded_direct')
        return score >= 70
          ? 'Customers have a credible direct path from your website into an order or high-intent action.'
          : 'Direct ordering exists, but the surrounding website experience still has conversion friction.'
      if (ordering?.status === 'none')
        return 'The website does not show a clear online ordering path.'
      return score >= 70
        ? 'Your website gives customers a solid direct path to act.'
        : 'Customers can reach you online, but the direct conversion path needs work.'
    },
  })

  const benchmarkReady =
    benchmark?.status === 'ready' &&
    benchmark?.source === 'universal_v3' &&
    benchmark?.presentationEligible === true &&
    (benchmark?.candidates?.length ?? 0) >= 3
  const metrics = reviews?.metrics
  // Only use sentiment when the review scorer has accepted the sample as
  // sufficiently deep. Raw Google Places snippets must never bypass the
  // sample-confidence guardrail.
  const recentPositive = normalizedProviderSection(sentimentSection)

  const targetRating =
    reviews?.googleRating === null || reviews?.googleRating === undefined
      ? input?.rating ?? null
      : reviews.googleRating
  const targetReviewCount =
    reviews?.googleReviewCount === null || reviews?.googleReviewCount === undefined
      ? input?.reviewCount ?? null
      : reviews.googleReviewCount

  const reputation = normSection({
    key: 'reputation',
    label: 'Reputation & Reviews',
    question: 'When diners compare options nearby, are you winning trust?',
    weight: 25,
    signals: [
      {
        score: ratingScore(targetRating),
        weight: 35,
        evidence:
          targetRating == null ? 'Google rating unavailable.' : `Google rating: ${targetRating}/5.`,
      },
      {
        score: recentPositive,
        weight: 25,
        evidence:
          recentPositive !== null && metrics?.sampleSize
            ? `${Math.round((metrics.positiveRate ?? 0) * 100)}% positive across ${metrics.sampleSize} recent reviews analyzed.`
            : 'Overall Google rating is used until a sufficiently deep recent-review sample is verified.',
      },
      {
        score: competitorRatingScore(
          targetRating == null ? null : Number(targetRating),
          benchmarkReady ? benchmark?.summary?.medianRating ?? null : null,
        ),
        weight: 15,
        evidence:
          benchmarkReady && benchmark?.summary?.medianRating != null
            ? `Likely local alternatives have a median Google rating of ${benchmark.summary.medianRating}.`
            : 'Local competitor rating benchmark was not available.',
      },
      {
        score: competitorReviewVolumeScore(
          targetReviewCount == null ? null : Number(targetReviewCount),
          benchmarkReady ? benchmark?.summary?.medianReviewCount ?? null : null,
        ),
        weight: 10,
        evidence:
          benchmarkReady && benchmark?.summary?.medianReviewCount != null
            ? `Likely local alternatives have a median of ${Math.round(benchmark.summary.medianReviewCount).toLocaleString()} Google reviews.`
            : 'Local competitor review-volume benchmark was not available.',
      },
      {
        score: searchReadinessScore(input, website),
        weight: 15,
        evidence: 'Website-on-Google and basic search-readiness signals were checked.',
      },
    ],
    summary: (score) => {
      if (score === null) return 'No reputation score is published from the available public evidence.'
      if (benchmarkReady && benchmark?.summary?.medianRating != null && targetRating != null) {
        const diff = Number(targetRating) - Number(benchmark.summary.medianRating)
        if (diff >= 0.15) return 'Your public reputation is stronger than the likely local competitive set.'
        if (diff <= -0.15) return 'Your public reputation trails the likely local competitive set.'
      }
      return score >= 75
        ? 'Your public reputation gives customers a strong reason to choose you.'
        : score >= 50
          ? 'Your reputation is credible, but there is room to strengthen trust and local visibility.'
          : 'Your public reputation and local presence are creating friction before the visit.'
    },
  })

  const retentionMap = retentionSignalsScoreMap(website)
  const retention = normSection({
    key: 'retention',
    label: 'Getting Customers Back',
    question: 'Are you giving first-time customers a reason and a path to come back?',
    weight: 20,
    signals: [
      {
        score: retentionMap.loyalty,
        weight: 30,
        evidence:
          retentionMap.loyalty === null
            ? 'Loyalty/rewards were not measured.'
            : retentionMap.loyalty
              ? 'Loyalty or rewards path detected.'
              : 'No loyalty/rewards path was detected publicly.',
      },
      {
        score: retentionMap.account,
        weight: 20,
        evidence:
          retentionMap.account === null
            ? 'Customer account path was not measured.'
            : retentionMap.account
              ? 'Customer account/login path detected.'
              : 'No customer account/login path was detected.',
      },
      {
        score: retentionMap.email,
        weight: 15,
        evidence:
          retentionMap.email === null
            ? 'Email capture was not measured.'
            : retentionMap.email
              ? 'Email capture detected.'
              : 'No email capture was detected.',
      },
      {
        score: retentionMap.messaging,
        weight: 15,
        evidence:
          retentionMap.messaging === null
            ? 'SMS/WhatsApp capture was not measured.'
            : retentionMap.messaging
              ? 'SMS or WhatsApp relationship path detected.'
              : 'No SMS/WhatsApp capture path was detected.',
      },
      {
        score: retentionMap.app,
        weight: 5,
        evidence:
          retentionMap.app === null
            ? 'Branded app presence was not measured.'
            : retentionMap.app
              ? 'Branded app path detected.'
              : 'No branded app path detected.',
      },
      {
        score: retentionMap.ordering,
        weight: 15,
        evidence:
          ordering?.summary || 'Ordering ownership was not measured.',
      },
    ],
    summary: (score) => {
      if (score === null) return 'No retention score is published from the available public evidence.'
      if (score >= 75) return 'Your public customer journey includes multiple clear ways to drive the second visit.'
      if (score >= 50) return 'Some repeat-customer mechanics are visible, but the retention loop is incomplete.'
      return 'The first transaction can happen, but the public journey shows little evidence of a strong second-order system.'
    },
  })

  const engagement = normSection({
    key: 'engagement',
    label: 'Staying Connected',
    question: 'Are you consistently staying in touch and closing the feedback loop?',
    weight: 15,
    // Engagement combines public social activity + owner review-response
    // behavior. Do not publish a 0/100 or 80/100 when only one half of that
    // relationship loop was actually measured.
    minCoverageForScore: 70,
    signals: [
      {
        score: normalizedProviderSection(socialSection),
        weight: 55,
        evidence: socialSection?.detail || 'Social activity was not measured.',
      },
      {
        score: normalizedProviderSection(reviewResponseSection),
        weight: 45,
        evidence: reviewResponseSection?.detail || 'Owner review responses were not measured.',
      },
    ],
    summary: (score) => {
      if (score === null) return 'No engagement score is published from the available public evidence.'
      if (score >= 75) return 'The restaurant is visibly staying in touch with customers across public channels.'
      if (score >= 50) return 'Customer communication is active, but inconsistent in at least one important channel.'
      return 'Public customer communication is too quiet or too inconsistent to function as a strong relationship engine.'
    },
  })

  const measurement = normSection({
    key: 'measurement',
    label: 'Knowing What Works',
    question: 'Do you have the public tracking foundation to know what is working and scale it?',
    weight: 15,
    signals: [
      {
        score: trackingScore(website),
        weight: 80,
        evidence:
          website?.htmlAvailable === false
            ? 'Tracking scripts were not measured from HTML.'
            : `Tracking detected: ${Object.entries(website?.tracking ?? {})
                .filter(([, value]) => Boolean(value))
                .map(([key]) => key)
                .join(', ') || 'no common analytics/ad pixels detected'}.`,
      },
      {
        score: searchReadinessScore(input, website),
        weight: 20,
        evidence: 'Basic search and page-structure measurement signals were checked.',
      },
    ],
    summary: (score) => {
      if (score === null) return 'Measurement readiness could not be determined.'
      if (score >= 75) return 'The website has a strong public analytics/attribution foundation.'
      if (score >= 50) return 'Some measurement infrastructure is visible, but attribution looks incomplete.'
      return 'The public website shows limited evidence that customer acquisition and conversion are being measured end to end.'
    },
  })

  const sections = [websiteOrdering, reputation, retention, engagement, measurement]

  const effectiveWeight = sections.reduce(
    (sum, section) =>
      sum +
      (section.score === null
        ? 0
        : section.weight * (section.coverage / 100)),
    0,
  )
  const weightedScore = sections.reduce(
    (sum, section) =>
      sum +
      (section.score === null
        ? 0
        : section.score * section.weight * (section.coverage / 100)),
    0,
  )

  const score = effectiveWeight ? Math.round(weightedScore / effectiveWeight) : 0
  const coverage = Math.round(effectiveWeight)
  const provisional = coverage < 85

  const sectionByKey = Object.fromEntries(sections.map((section) => [section.key, section]))

  const siteScore = websiteOrdering.score ?? 0
  const repScore = reputation.score ?? 0
  const retentionScore = retention.score ?? 0
  const measurementScore = measurement.score ?? 0

  let paidMediaReadiness: 'ready' | 'almost_ready' | 'fix_engine_first' = 'fix_engine_first'

  // Paid media is fuel for a working engine, not a way to hide structural leaks.
  // "Ready" requires strong direct conversion plus credible retention,
  // reputation and measurement foundations. Low-coverage sections cannot unlock
  // a green readiness state.
  const siteCoverage = sectionByKey.websiteOrdering?.coverage ?? 0
  const repCoverage = sectionByKey.reputation?.coverage ?? 0
  const retentionCoverage = sectionByKey.retention?.coverage ?? 0
  const measurementCoverage = sectionByKey.measurement?.coverage ?? 0

  if (
    siteScore >= 75 &&
    repScore >= 65 &&
    retentionScore >= 70 &&
    measurementScore >= 65 &&
    siteCoverage >= 70 &&
    repCoverage >= 65 &&
    retentionCoverage >= 65 &&
    measurementCoverage >= 60
  ) {
    paidMediaReadiness = 'ready'
  } else if (
    siteScore >= 65 &&
    repScore >= 55 &&
    retentionScore >= 45 &&
    measurementScore >= 45 &&
    siteCoverage >= 55
  ) {
    paidMediaReadiness = 'almost_ready'
  }

  const paidMediaSummary =
    paidMediaReadiness === 'ready'
      ? 'Your core growth engine is strong enough that paid media can act as fuel instead of compensation for broken customer journeys.'
      : paidMediaReadiness === 'almost_ready'
        ? 'You are close to being ready to scale acquisition, but at least one conversion, retention, or measurement gap should be fixed first.'
        : 'Fix the core engine before aggressively buying more traffic; otherwise paid media can amplify leaks instead of creating repeatable growth.'

  return {
    score: clamp(score),
    coverage: clamp(coverage),
    provisional,
    sections,
    sectionByKey,
    ordering: website?.ordering ?? null,
    paidMediaReadiness: {
      status: paidMediaReadiness,
      summary: paidMediaSummary,
    },
  }
}


export function fallbackGrowthInterpretation(result: any, benchmark?: any) {
  // A real engine set is publishable; presentationEligible only decides how
  // confidently it is framed in the UI, not whether the section exists.
  const benchmarkPublishable =
    benchmark?.source === 'universal_v3' &&
    (benchmark?.candidates?.length ?? 0) >= 3
  const sections = Array.isArray(result?.sections) ? result.sections : []
  const ranked = [...sections]
    .filter((section) => typeof section?.score === 'number')
    .sort((a, b) => Number(a.score) - Number(b.score))

  const weakest = ranked[0]
  const second = ranked[1]

  const primaryLeak =
    weakest?.key === 'websiteOrdering'
      ? 'Your biggest growth leak is between customer intent and a direct order.'
      : weakest?.key === 'retention'
        ? 'You can win the first visit, but the public journey shows a weak second-visit system.'
        : weakest?.key === 'engagement'
          ? 'Customer attention exists, but public follow-up and engagement are inconsistent.'
          : weakest?.key === 'measurement'
            ? 'The restaurant has limited public measurement infrastructure to know what is driving growth.'
            : weakest?.key === 'reputation'
              ? 'The biggest gap is winning trust when customers compare nearby options.'
              : 'The main growth leak is still being measured.'

  const priorities = [weakest, second]
    .filter(Boolean)
    .map((section: any) => {
      if (section.key === 'websiteOrdering') return 'Strengthen the direct ordering and mobile conversion path.'
      if (section.key === 'retention') return 'Create a visible path from the first transaction to loyalty, email, SMS, WhatsApp, or an account.'
      if (section.key === 'engagement') return 'Make social communication and review responses consistent enough to function as an active customer channel.'
      if (section.key === 'measurement') return 'Connect analytics and conversion tracking before scaling paid acquisition.'
      if (section.key === 'reputation') return benchmarkPublishable ? 'Close the reputation gap against the restaurants customers are most likely to compare you with.' : 'Strengthen the public reputation signals customers use when deciding where to eat.'
      return section.summary
    })

  while (priorities.length < 3) {
    priorities.push('Turn more of today’s customer attention into a direct, repeatable relationship.')
  }

  const benchmarkSummary =
    benchmarkPublishable
      ? `The local benchmark uses ${benchmark.candidates.length} high-confidence alternatives within roughly ${benchmark.radiusKm} km.`
      : ''

  return {
    maturityStage:
      result?.score >= 80
        ? 'strong engine'
        : result?.score >= 60
          ? 'working engine'
          : result?.score >= 40
            ? 'leaky engine'
            : 'early foundation',
    executiveSummary:
      result?.score >= 75
        ? `Your Growth Engine Score is ${result.score}/100. The core customer journey is working, with a smaller number of gaps holding back repeatable growth.`
        : `Your Growth Engine Score is ${result?.score ?? 0}/100. Customer demand is reaching the restaurant, but meaningful leaks remain between attention, direct conversion, retention, and measurement.`,
    primaryLeak,
    priorities: priorities.slice(0, 3),
    growthStory: primaryLeak,
    paidMediaReadinessSummary: result?.paidMediaReadiness?.summary,
    competitorSummary: benchmarkSummary,
    pillarSummaries: Object.fromEntries(
      sections.map((section: any) => [section.key, section.summary]),
    ),
    strengths: sections
      .filter((section: any) => section.status === 'good')
      .map((section: any) => section.label),
    socialSummary: '',
    journey: {
      attract: sections.find((s: any) => s.key === 'reputation')?.summary || '',
      convert: sections.find((s: any) => s.key === 'websiteOrdering')?.summary || '',
      retain: sections.find((s: any) => s.key === 'retention')?.summary || '',
      grow: sections.find((s: any) => s.key === 'measurement')?.summary || '',
    },
    missingEvidence: sections
      .filter((section: any) => section.coverage < 60)
      .map((section: any) => section.label),
    confidence: result?.coverage >= 85 ? 'high' : result?.coverage >= 65 ? 'medium' : 'limited',
    reviewThemes: [],
  }
}
