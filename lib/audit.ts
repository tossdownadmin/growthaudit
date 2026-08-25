import * as cheerio from "cheerio"

export type AuditSection = { key: string; label: string; earned: number | null; max: number; status: 'good' | 'warning' | 'bad' | 'unknown'; detail: string; evidence?: string[] }
export type GmbOpeningHours = { daysOpen: number | null; weekdayDescriptions: string[] }
export type RestaurantInput = { placeId: string; name: string; address: string; websiteUrl: string; googleWebsiteUrl?: string; lat?: number; lng?: number; rating?: number | null; reviewCount?: number | null; reviews?: any[]; openingHours?: GmbOpeningHours | null; socials: { instagram?: string; facebook?: string; tiktok?: string; youtube?: string; twitter?: string; threads?: string; linkedin?: string; pinterest?: string; snapchat?: string; whatsapp?: string } }
export type SocialScoreInput = { earned: number | null; max: number; status: 'good' | 'warning' | 'bad' | 'unknown'; detail: string; evidence?: string[] } | null
export type SectionScoreInput = { earned: number | null; max: number; status: 'good' | 'warning' | 'bad' | 'unknown'; detail: string; evidence?: string[] } | null
export type WebsiteInspection = {
  reachable: boolean
  https: boolean
  title: boolean
  meta: boolean
  h1: boolean
  canonical: boolean
  schema: boolean
  performance: number | null
  seo: number | null
  directPaths: string[]
  ordering?: {
    status: 'owned' | 'branded_direct' | 'marketplace' | 'mixed' | 'unclear' | 'none'
    summary: string
    primaryUrl: string | null
    provider: string | null
    marketplaceProviders: string[]
    directProviders: string[]
    links: Array<{ label: string; url: string; kind: 'owned' | 'branded_direct' | 'marketplace' | 'unclear'; provider: string | null }>
  }
  customerPaths?: {
    ordering: boolean
    menu: boolean
    reservation: boolean
    directContact: boolean
    loyalty: boolean
    account: boolean
    emailCapture: boolean
    smsCapture: boolean
    whatsapp: boolean
    app: boolean
  }
  tracking?: {
    ga4: boolean
    gtm: boolean
    googleAds: boolean
    metaPixel: boolean
    tiktokPixel: boolean
  }
  statusCode?: number
  responseMs?: number
  contentBytes?: number
  htmlAvailable?: boolean
  htmlSource?: 'direct' | 'browserless' | 'none'
  fetchError?: string | null
  finalUrl?: string | null
  metaTags: {
    title: string | null
    description: string | null
    robots: string | null
    viewport: string | null
    ogTitle: string | null
    ogDescription: string | null
    ogImage: string | null
    twitterCard: string | null
    canonical: string | null
  }
  headings: { h1: string[]; h2: string[] }
  links: { internal: number; external: number; nofollow: number }
  resources: { scripts: number; stylesheets: number; images: number; fonts: number }
  performanceSignals: {
    htmlBytes: number
    hasViewport: boolean
    renderBlockingScripts: number
    renderBlockingStyles: number
    lazyImages: number
    modernImageFormats: number
    thirdPartyHosts: string[]
  }
  // Opening hours parsed from the site's own structured data (JSON-LD). Used to
  // cross-check against the hours published on the Google Business Profile.
  openingHours?: { source: 'schema'; days: number; specs: string[] } | null
  pageSpeed?: PageSpeedReport | null
}

export type PageSpeedStrategy = 'mobile' | 'desktop'
export type PageSpeedMetric = { value: number | null; display: string | null }
export type PageSpeedRun = {
  strategy: PageSpeedStrategy
  performance: number | null
  seo: number | null
  accessibility: number | null
  bestPractices: number | null
  fieldData: string | null
  finalUrl: string | null
  metrics: {
    lcp: PageSpeedMetric
    fcp: PageSpeedMetric
    cls: PageSpeedMetric
    tbt: PageSpeedMetric
    speedIndex: PageSpeedMetric
    tti: PageSpeedMetric
  }
  opportunities: string[]
  seoChecks: {
    documentTitle: boolean | null
    metaDescription: boolean | null
    viewport: boolean | null
    crawlable: boolean | null
    robotsTxt: boolean | null
  }
}
export type PageSpeedReport = { mobile: PageSpeedRun | null; desktop: PageSpeedRun | null }

// One PageSpeed attempt. Throws with a `.retryable` flag on transient failures.
async function fetchPageSpeedOnce(
  url: string,
  strategy: PageSpeedStrategy,
  apiKey: string,
  timeoutMs: number,
): Promise<PageSpeedRun | null> {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
  endpoint.searchParams.set('url', url)
  endpoint.searchParams.set('strategy', strategy)
  endpoint.searchParams.set('key', apiKey)
  ;['performance', 'seo', 'accessibility', 'best-practices'].forEach((category) =>
    endpoint.searchParams.append('category', category),
  )

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(endpoint.toString(), {
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const err: any = new Error(body?.error?.message || `PageSpeed HTTP ${response.status}`)
      // 429 (rate limit) and 5xx (transient Lighthouse/backend errors) are worth retrying.
      err.retryable = response.status === 429 || response.status >= 500
      throw err
    }

    const data = await response.json()
    const cats = data?.lighthouseResult?.categories ?? {}
    const audits = data?.lighthouseResult?.audits ?? {}

    const score = (value: any) =>
      typeof value === 'number' ? Math.round(value * 100) : null

    const metric = (key: string): PageSpeedMetric => ({
      value:
        typeof audits[key]?.numericValue === 'number'
          ? audits[key].numericValue
          : null,
      display: audits[key]?.displayValue ?? null,
    })

    const auditPass = (key: string): boolean | null => {
      const value = audits[key]?.score
      return typeof value === 'number' ? value === 1 : null
    }

    const opportunities = Object.values(audits)
      .filter(
        (audit: any) =>
          audit?.details?.type === 'opportunity' &&
          typeof audit?.numericValue === 'number' &&
          audit.numericValue > 150,
      )
      .map((audit: any) => audit.title)
      .slice(0, 5)

    return {
      strategy,
      performance: score(cats.performance?.score),
      seo: score(cats.seo?.score),
      accessibility: score(cats.accessibility?.score),
      bestPractices: score(cats['best-practices']?.score),
      fieldData: data?.loadingExperience?.overall_category ?? null,
      finalUrl: data?.lighthouseResult?.finalUrl ?? null,
      metrics: {
        lcp: metric('largest-contentful-paint'),
        fcp: metric('first-contentful-paint'),
        cls: metric('cumulative-layout-shift'),
        tbt: metric('total-blocking-time'),
        speedIndex: metric('speed-index'),
        tti: metric('interactive'),
      },
      opportunities,
      seoChecks: {
        documentTitle: auditPass('document-title'),
        metaDescription: auditPass('meta-description'),
        viewport: auditPass('viewport'),
        crawlable: auditPass('is-crawlable'),
        robotsTxt: auditPass('robots-txt'),
      },
    }
  } catch (error: any) {
    // Aborted (timeout) requests are transient and worth one retry.
    if (error?.name === 'AbortError') error.retryable = true
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch PageSpeed for one strategy with a bounded retry.
 *
 * The two strategies (mobile/desktop) are fired in parallel by the caller, and
 * PSI intermittently fails ONE of them with a transient 429/5xx or a slow
 * Lighthouse run that aborts. A single retry with a short backoff recovers the
 * desktop score that was previously coming back empty. Timeouts are kept tight
 * so two attempts still fit inside the route's overall time budget.
 */
export async function fetchPageSpeed(
  url: string,
  strategy: PageSpeedStrategy,
  apiKey: string,
): Promise<PageSpeedRun | null> {
  const attempts = 2
  const perAttemptTimeoutMs = 24000
  let lastError: any = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchPageSpeedOnce(url, strategy, apiKey, perAttemptTimeoutMs)
    } catch (error: any) {
      lastError = error
      const canRetry = attempt < attempts && error?.retryable !== false
      if (!canRetry) break
      await new Promise((resolve) => setTimeout(resolve, 1200))
    }
  }
  throw lastError ?? new Error('PageSpeed request failed')
}

export type WebsiteHtmlFetch = {
  html: string | null
  source: 'direct' | 'browserless' | 'none'
  statusCode: number | null
  finalUrl: string | null
  responseMs: number | null
  contentBytes: number | null
  error: string | null
}

function normalizeWebsiteUrl(value: string) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function looksLikeUsableHtml(html: string, contentType: string | null) {
  if (!html || html.trim().length < 500) return false
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return false
  }
  return /<html\b|<head\b|<body\b|<title\b|<meta\b/i.test(html)
}

export async function fetchWebsiteHtml(url: string): Promise<WebsiteHtmlFetch> {
  const normalized = normalizeWebsiteUrl(url)
  if (!normalized) {
    return {
      html: null,
      source: 'none',
      statusCode: null,
      finalUrl: null,
      responseMs: null,
      contentBytes: null,
      error: 'No website URL supplied',
    }
  }

  const started = Date.now()
  let directStatus: number | null = null
  let directFinalUrl: string | null = null
  let directError: string | null = null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(normalized, {
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    }).finally(() => clearTimeout(timer))

    directStatus = response.status
    directFinalUrl = response.url || normalized
    const html = await response.text()
    const bytes = new TextEncoder().encode(html).byteLength

    if (
      response.ok &&
      looksLikeUsableHtml(html, response.headers.get('content-type'))
    ) {
      return {
        html,
        source: 'direct',
        statusCode: response.status,
        finalUrl: directFinalUrl,
        responseMs: Date.now() - started,
        contentBytes: bytes,
        error: null,
      }
    }

    directError = `Direct HTML fetch returned HTTP ${response.status} or unusable HTML`
  } catch (error: any) {
    directError = error?.message || 'Direct HTML fetch failed'
  }

  const browserlessToken = process.env.BROWSERLESS_TOKEN || ''
  if (!browserlessToken) {
    return {
      html: null,
      source: 'none',
      statusCode: directStatus,
      finalUrl: directFinalUrl || normalized,
      responseMs: Date.now() - started,
      contentBytes: null,
      error: directError,
    }
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25000)

    const endpoint = new URL('https://production-sfo.browserless.io/content')
    endpoint.searchParams.set('token', browserlessToken)

    const response = await fetch(endpoint.toString(), {
      method: 'POST',
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({ url: directFinalUrl || normalized }),
    }).finally(() => clearTimeout(timer))

    const html = await response.text()
    const bytes = new TextEncoder().encode(html).byteLength

    if (response.ok && looksLikeUsableHtml(html, 'text/html')) {
      return {
        html,
        source: 'browserless',
        statusCode: directStatus ?? 200,
        finalUrl: directFinalUrl || normalized,
        responseMs: Date.now() - started,
        contentBytes: bytes,
        error: null,
      }
    }

    return {
      html: null,
      source: 'none',
      statusCode: directStatus,
      finalUrl: directFinalUrl || normalized,
      responseMs: Date.now() - started,
      contentBytes: bytes || null,
      error: `Browserless fallback failed with HTTP ${response.status}`,
    }
  } catch (error: any) {
    return {
      html: null,
      source: 'none',
      statusCode: directStatus,
      finalUrl: directFinalUrl || normalized,
      responseMs: Date.now() - started,
      contentBytes: null,
      error: error?.message || directError || 'Rendered HTML fetch failed',
    }
  }
}

export function scoreAudit(input: RestaurantInput, website: { reachable: boolean | null; https: boolean | null; title: boolean | null; meta: boolean | null; h1: boolean | null; canonical: boolean | null; schema: boolean | null; performance: number | null; seo: number | null; directPaths: string[]; pageSpeed?: PageSpeedReport | null }, reviews: { total: number | null; responseRate: number | null; negativeResponseRate: number | null; positiveShare: number | null; negativeShare: number | null }, social?: SocialScoreInput, reviewResponse?: SectionScoreInput, sentiment?: SectionScoreInput) {
  const psiPerf = website.pageSpeed?.mobile?.performance ?? website.pageSpeed?.desktop?.performance ?? null
  const healthEarned = website.reachable === null ? null : website.reachable ? (psiPerf === null ? 25 : Math.round(25 * (psiPerf / 100))) : 0
  const healthDetail = website.reachable === null ? 'Website health could not be measured.' : !website.reachable ? 'The website did not return a successful response.' : psiPerf === null ? 'The site responded and its customer paths were inspected.' : `PageSpeed measured a ${psiPerf}/100 mobile performance score.`
  const sections: AuditSection[] = [
    { key:'googleWebsite', label:'Google → Website', earned: input.websiteUrl ? 15 : 0, max:15, status: input.websiteUrl ? 'good':'bad', detail: input.websiteUrl ? 'Google is sending customers to an owned web destination.' : 'No owned website was confirmed on the Google profile.' },
    { key:'websiteHealth', label:'Website Health', earned: healthEarned, max:25, status: website.reachable === null ? 'unknown' : !website.reachable ? 'bad' : psiPerf === null ? 'good' : psiPerf >= 75 ? 'good' : psiPerf >= 45 ? 'warning' : 'bad', detail: healthDetail },
    reviewResponse
      ? { key:'reviewResponse', label:'Review Response', earned: reviewResponse.earned, max: reviewResponse.max, status: reviewResponse.status, detail: reviewResponse.detail, evidence: reviewResponse.evidence }
      : { key:'reviewResponse', label:'Review Response', earned: null, max:20, status: 'unknown', detail: 'Owner response analysis: Not measured.' },
    sentiment
      ? { key:'sentiment', label:'Customer Sentiment', earned: sentiment.earned, max: sentiment.max, status: sentiment.status, detail: sentiment.detail, evidence: sentiment.evidence }
      : { key:'sentiment', label:'Customer Sentiment', earned: null, max:15, status: 'unknown', detail: 'Customer sentiment could not be measured from a review sample.' },
    social
      ? { key:'social', label:'Social Activity & Engagement', earned: social.earned, max: social.max, status: social.status, detail: social.detail, evidence: social.evidence }
      : { key:'social', label:'Social Activity & Engagement', earned: Object.values(input.socials).some(Boolean) ? null : 0, max:10, status: Object.values(input.socials).some(Boolean) ? 'unknown':'bad', detail: Object.values(input.socials).some(Boolean) ? 'Social profiles confirmed; activity was not measured.' : 'No social profiles were discovered or confirmed.' },
    { key:'relationship', label:'Direct Relationship Readiness', earned: website.reachable === null ? null : Math.min(15, website.directPaths.length * 3), max:15, status: website.reachable === null ? 'unknown' : website.directPaths.length >= 3 ? 'good' : website.directPaths.length ? 'warning':'bad', detail: website.reachable === null ? 'Direct customer paths are not measured yet.' : website.directPaths.length ? `Observed: ${website.directPaths.join(', ')}.` : 'No clear owned repeat-customer path was observed.' },
  ]
  const known = sections.filter(s => s.earned !== null); const earned = known.reduce((a,s)=>a+(s.earned ?? 0),0); const max = known.reduce((a,s)=>a+s.max,0)
  return { sections, score: max ? Math.round(100*earned/max) : 0, coverage: Math.round(100*max/100), provisional: max < 85 }
}

// Parse opening hours out of JSON-LD structured data. Restaurants that publish
// schema usually expose either `openingHoursSpecification` (structured) or an
// `openingHours` string like "Mo-Fr 09:00-17:00". We only need the COUNT of
// distinct days covered so we can compare it against the Google profile.
function extractSchemaOpeningHours(schemaScripts: any, $: any): { source: 'schema'; days: number; specs: string[] } | null {
  const DAY_MAP: Record<string, string> = { mo: 'Monday', mon: 'Monday', monday: 'Monday', tu: 'Tuesday', tue: 'Tuesday', tues: 'Tuesday', tuesday: 'Tuesday', we: 'Wednesday', wed: 'Wednesday', wednesday: 'Wednesday', th: 'Thursday', thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', thursday: 'Thursday', fr: 'Friday', fri: 'Friday', friday: 'Friday', sa: 'Saturday', sat: 'Saturday', saturday: 'Saturday', su: 'Sunday', sun: 'Sunday', sunday: 'Sunday' }
  const ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const days = new Set<string>()
  const specs: string[] = []
  const normDay = (raw: any): string | null => {
    const key = String(raw ?? '').split('/').pop()!.trim().toLowerCase()
    return DAY_MAP[key] ?? null
  }
  const addRange = (from: any, to: any) => {
    const a = ORDER.indexOf(normDay(from) || ''); const b = ORDER.indexOf(normDay(to) || '')
    if (a === -1 || b === -1) return
    let i = a
    for (let guard = 0; guard < 7; guard += 1) { days.add(ORDER[i]); if (i === b) break; i = (i + 1) % 7 }
  }
  const handleString = (raw: string) => {
    if (!raw) return
    specs.push(raw.trim())
    for (const part of String(raw).split(/[,;]/)) {
      const range = part.trim().match(/^([A-Za-z]{2,9})\s*-\s*([A-Za-z]{2,9})/)
      if (range) { addRange(range[1], range[2]); continue }
      const single = part.trim().match(/^([A-Za-z]{2,9})\b/)
      if (single) { const d = normDay(single[1]); if (d) days.add(d) }
    }
  }
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 6) return
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return }
    const oh = node.openingHours
    if (typeof oh === 'string') handleString(oh)
    else if (Array.isArray(oh)) oh.forEach((v) => typeof v === 'string' && handleString(v))
    const spec = node.openingHoursSpecification
    const specArr = Array.isArray(spec) ? spec : spec ? [spec] : []
    for (const sp of specArr) {
      if (!sp || typeof sp !== 'object') continue
      const dow = sp.dayOfWeek
      const list = Array.isArray(dow) ? dow : dow ? [dow] : []
      for (const d of list) { const nd = normDay(d); if (nd) days.add(nd) }
      if (list.length) specs.push(`${list.map((x: any) => String(x).split('/').pop()).join(', ')} ${sp.opens ?? ''}-${sp.closes ?? ''}`.trim())
    }
    for (const key of Object.keys(node)) {
      if (key === 'openingHours' || key === 'openingHoursSpecification') continue
      walk(node[key], depth + 1)
    }
  }
  schemaScripts.each((_: any, el: any) => {
    const raw = $(el).contents().text() || $(el).text()
    if (!raw) return
    try { walk(JSON.parse(raw), 0) } catch { /* malformed JSON-LD is ignored */ }
  })
  if (days.size === 0) return null
  return { source: 'schema', days: days.size, specs: specs.slice(0, 7) }
}

export function inspectHtml(html: string, url: string): WebsiteInspection {
  const $ = cheerio.load(html)
  const baseUrl = new URL(url)
  const clean = (value?: string | null) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim() || null

  const metaByName = (name: string) =>
    clean($(`meta[name="${name}"]`).first().attr('content'))

  const metaByProperty = (property: string) =>
    clean($(`meta[property="${property}"]`).first().attr('content'))

  const title = clean($('head title').first().text() || $('title').first().text())
  const description = metaByName('description')
  const canonical = clean($('link[rel~="canonical"]').first().attr('href'))
  const robots = metaByName('robots')
  const viewport = metaByName('viewport')
  const ogTitle = metaByProperty('og:title')
  const ogDescription = metaByProperty('og:description')
  const ogImage = metaByProperty('og:image')
  const twitterCard =
    metaByName('twitter:card') || metaByProperty('twitter:card')

  const h1 = $('h1')
    .map((_, element) => clean($(element).text()))
    .get()
    .filter(Boolean)
    .slice(0, 20) as string[]

  const h2 = $('h2')
    .map((_, element) => clean($(element).text()))
    .get()
    .filter(Boolean)
    .slice(0, 20) as string[]

  const linkRows = $('a[href]')
    .map((_, element) => ({
      href: $(element).attr('href') || '',
      nofollow: /\bnofollow\b/i.test($(element).attr('rel') || ''),
    }))
    .get()

  let internal = 0
  let external = 0
  for (const link of linkRows) {
    try {
      const resolved = new URL(link.href, url)
      if (resolved.hostname === baseUrl.hostname) internal += 1
      else external += 1
    } catch {
      // Ignore malformed links.
    }
  }

  const scriptRows = $('script')
  const stylesheetRows = $('link[rel~="stylesheet"]')
  const imageRows = $('img')

  const thirdPartyHosts = new Set<string>()
  scriptRows.each((_, element) => {
    const src = $(element).attr('src')
    if (!src) return
    try {
      const host = new URL(src, url).hostname
      if (host && host !== baseUrl.hostname) thirdPartyHosts.add(host)
    } catch {}
  })
  stylesheetRows.each((_, element) => {
    const href = $(element).attr('href')
    if (!href) return
    try {
      const host = new URL(href, url).hostname
      if (host && host !== baseUrl.hostname) thirdPartyHosts.add(host)
    } catch {}
  })

  let renderBlockingScripts = 0
  scriptRows.each((_, element) => {
    const node = $(element)
    if (!node.attr('async') && !node.attr('defer') && node.attr('src')) {
      renderBlockingScripts += 1
    }
  })

  const lazyImages = $('img[loading="lazy"]').length

  let modernImageFormats = 0
  imageRows.each((_, element) => {
    const src = `${$(element).attr('src') || ''} ${$(element).attr('srcset') || ''}`
    if (/\.(?:webp|avif)(?:\?|#|\s|$)/i.test(src)) modernImageFormats += 1
  })

  const htmlBytes = new TextEncoder().encode(html).byteLength
  const schemaScripts = $('script[type="application/ld+json"]')
  const schema = schemaScripts.length > 0

  const visibleText = $('body').text().replace(/\s+/g, ' ')
  const searchable = `${html} ${visibleText}`

  const directPaths: string[] = []
  const pathTests: Array<[string, RegExp]> = [
    ['direct ordering', /\b(order online|order now|start order|order pickup|pickup order)\b/i],
    ['reservation', /\b(reserve|reservation|book a table|table booking)\b/i],
    ['loyalty', /\b(loyalty|rewards|reward points|vip club)\b/i],
    ['email capture', /\b(newsletter|subscribe|join our list|email updates)\b/i],
    ['SMS capture', /\b(text club|sms|text updates|mobile club)\b/i],
    ['direct contact', /(tel:|mailto:|\bcontact us\b|\bget in touch\b)/i],
  ]

  for (const [name, pattern] of pathTests) {
    if (pattern.test(searchable)) directPaths.push(name)
  }

  // Ordering is not just yes/no. For a restaurant-growth audit we distinguish
  // owned/branded ordering from a handoff to a delivery marketplace.
  const normalizeHost = (raw: string) => raw.replace(/^www\./i, '').toLowerCase()
  const ownHost = normalizeHost(baseUrl.hostname)
  const sameOwnedHost = (host: string) => {
    const h = normalizeHost(host)
    return h === ownHost || h.endsWith(`.${ownHost}`)
  }

  const marketplaceDomains: Array<[RegExp, string]> = [
    [/(^|\.)doordash\.com$/i, 'DoorDash'],
    [/(^|\.)ubereats\.com$/i, 'Uber Eats'],
    [/(^|\.)grubhub\.com$/i, 'Grubhub'],
    [/(^|\.)seamless\.com$/i, 'Seamless'],
    [/(^|\.)postmates\.com$/i, 'Postmates'],
    [/(^|\.)skipthe(?:dishes)?\.com$/i, 'Skip'],
    [/(^|\.)foodpanda\./i, 'Foodpanda'],
    [/(^|\.)deliveroo\./i, 'Deliveroo'],
    [/(^|\.)just-eat\./i, 'Just Eat'],
    [/(^|\.)delivery\.com$/i, 'Delivery.com'],
  ]

  const directOrderingDomains: Array<[RegExp, string]> = [
    [/(^|\.)toasttab\.com$/i, 'Toast'],
    [/(^|\.)chownow\.com$/i, 'ChowNow'],
    [/(^|\.)olo\.com$/i, 'Olo'],
    [/(^|\.)clover\.com$/i, 'Clover'],
    [/(^|\.)square\.site$/i, 'Square'],
    [/(^|\.)bentobox\.com$/i, 'BentoBox'],
    [/(^|\.)owner\.com$/i, 'Owner'],
    [/(^|\.)flipdish\./i, 'Flipdish'],
    [/(^|\.)tossdown\./i, 'tossdown'],
  ]

  const providerFor = (host: string, rows: Array<[RegExp, string]>) =>
    rows.find(([pattern]) => pattern.test(host))?.[1] ?? null

  const orderLinks: Array<{
    label: string
    url: string
    kind: 'owned' | 'branded_direct' | 'marketplace' | 'unclear'
    provider: string | null
  }> = []

  $('a[href]').each((_, element) => {
    const node = $(element)
    const href = String(node.attr('href') || '').trim()
    const label = clean(
      `${node.text()} ${node.attr('aria-label') || ''} ${node.attr('title') || ''}`,
    ) || ''
    if (!href) return

    let resolved: URL
    try {
      resolved = new URL(href, url)
    } catch {
      return
    }

    const host = normalizeHost(resolved.hostname)
    const marketplaceProvider = providerFor(host, marketplaceDomains)
    const directProvider = providerFor(host, directOrderingDomains)
    const looksLikeOrder =
      /\b(order|delivery|deliver|pickup|pick up|takeout|take out|takeaway)\b/i.test(label) ||
      /\b(order|delivery|pickup|takeout|take-away|takeaway)\b/i.test(resolved.pathname) ||
      Boolean(marketplaceProvider)

    if (!looksLikeOrder) return

    if (marketplaceProvider) {
      orderLinks.push({
        label: label || marketplaceProvider,
        url: resolved.toString(),
        kind: 'marketplace',
        provider: marketplaceProvider,
      })
      return
    }

    if (sameOwnedHost(host)) {
      orderLinks.push({
        label: label || 'Order online',
        url: resolved.toString(),
        kind: 'owned',
        provider: null,
      })
      return
    }

    if (directProvider) {
      orderLinks.push({
        label: label || `Order with ${directProvider}`,
        url: resolved.toString(),
        kind: 'branded_direct',
        provider: directProvider,
      })
      return
    }

    orderLinks.push({
      label: label || 'Order online',
      url: resolved.toString(),
      kind: 'unclear',
      provider: host || null,
    })
  })

  // De-duplicate URLs because responsive headers/footers often repeat the same CTA.
  const uniqueOrderLinks = [...new Map(orderLinks.map((row) => [row.url, row])).values()]
  const hasOwnedOrdering = uniqueOrderLinks.some((row) => row.kind === 'owned')
  const hasBrandedOrdering = uniqueOrderLinks.some((row) => row.kind === 'branded_direct')
  const hasMarketplaceOrdering = uniqueOrderLinks.some((row) => row.kind === 'marketplace')
  const hasUnclearOrdering = uniqueOrderLinks.some((row) => row.kind === 'unclear')

  let orderingStatus: NonNullable<WebsiteInspection['ordering']>['status'] = 'none'
  if ((hasOwnedOrdering || hasBrandedOrdering) && hasMarketplaceOrdering) orderingStatus = 'mixed'
  else if (hasOwnedOrdering) orderingStatus = 'owned'
  else if (hasBrandedOrdering) orderingStatus = 'branded_direct'
  else if (hasMarketplaceOrdering) orderingStatus = 'marketplace'
  else if (hasUnclearOrdering || directPaths.includes('direct ordering')) orderingStatus = 'unclear'

  const marketplaceProviders = [...new Set(
    uniqueOrderLinks
      .filter((row) => row.kind === 'marketplace')
      .map((row) => row.provider)
      .filter((value): value is string => Boolean(value)),
  )]
  const directProviders = [...new Set(
    uniqueOrderLinks
      .filter((row) => row.kind === 'branded_direct')
      .map((row) => row.provider)
      .filter((value): value is string => Boolean(value)),
  )]

  const primaryOrderLink =
    uniqueOrderLinks.find((row) => row.kind === 'owned') ??
    uniqueOrderLinks.find((row) => row.kind === 'branded_direct') ??
    uniqueOrderLinks.find((row) => row.kind === 'marketplace') ??
    uniqueOrderLinks[0] ??
    null

  const orderingSummary =
    orderingStatus === 'owned'
      ? 'Online ordering stays on the restaurant’s own web domain.'
      : orderingStatus === 'branded_direct'
        ? `A branded/direct ordering path was detected${directProviders.length ? ` through ${directProviders.join(', ')}` : ''}.`
        : orderingStatus === 'marketplace'
          ? `The visible ordering path sends customers to ${marketplaceProviders.join(', ') || 'a third-party marketplace'}.`
          : orderingStatus === 'mixed'
            ? 'Both direct/branded ordering and third-party marketplace ordering are visible.'
            : orderingStatus === 'unclear'
              ? 'Online ordering appears to exist, but ownership of the ordering relationship could not be verified.'
              : 'No clear online ordering path was detected on the website.'

  const customerPaths = {
    ordering: orderingStatus !== 'none',
    menu: /\b(menu|view menu|our menu)\b/i.test(searchable),
    reservation: /\b(reserve|reservation|book a table|table booking)\b/i.test(searchable),
    directContact: /(tel:|mailto:|\bcontact us\b|\bget in touch\b)/i.test(searchable),
    loyalty: /\b(loyalty|rewards|reward points|vip club|member rewards)\b/i.test(searchable),
    account: /\b(sign in|log in|login|create account|register|my account)\b/i.test(searchable),
    emailCapture: /\b(newsletter|subscribe|join our list|email updates|email offers)\b/i.test(searchable),
    smsCapture: /\b(text club|sms|text updates|mobile club|text offers)\b/i.test(searchable),
    whatsapp: /(wa\.me\/|api\.whatsapp\.com|whatsapp:\/\/)/i.test(html),
    app: /(apps\.apple\.com|play\.google\.com\/store\/apps|download (?:our|the) app|mobile app)/i.test(searchable),
  }

  const tracking = {
    ga4: /(googletagmanager\.com\/gtag\/js|gtag\(\s*['"]config['"]\s*,\s*['"]G-[A-Z0-9]+)/i.test(html),
    gtm: /\bGTM-[A-Z0-9]+\b/i.test(html),
    googleAds: /(\bAW-\d+\b|googleadservices\.com|googleads\.g\.doubleclick\.net)/i.test(html),
    metaPixel: /(connect\.facebook\.net\/.+fbevents\.js|\bfbq\s*\()/i.test(html),
    tiktokPixel: /(analytics\.tiktok\.com|business-api\.tiktok\.com|\bttq\s*\.)/i.test(html),
  }

  const metaTags = {
    title,
    description,
    robots,
    viewport,
    ogTitle,
    ogDescription,
    ogImage,
    twitterCard,
    canonical,
  }

  const hasViewport = Boolean(viewport)
  const renderBlockingStyles = stylesheetRows.length
  const fonts = (
    html.match(/@font-face|fonts\.googleapis|\.(?:woff2?|ttf|otf)(?:\?|["')\s])/gi) || []
  ).length

  const performanceSignals = {
    htmlBytes,
    hasViewport,
    renderBlockingScripts,
    renderBlockingStyles,
    lazyImages,
    modernImageFormats,
    thirdPartyHosts: [...thirdPartyHosts],
  }

  const seoSignals = [
    Boolean(title),
    Boolean(description),
    h1.length > 0,
    Boolean(canonical),
    Boolean(ogTitle),
    Boolean(ogDescription),
    Boolean(ogImage),
    Boolean(robots),
    Boolean(viewport),
    schema,
  ]

  return {
    reachable: true,
    https: baseUrl.protocol === 'https:',
    title: Boolean(title),
    meta: Boolean(description),
    h1: h1.length > 0,
    canonical: Boolean(canonical),
    schema,
    performance: Math.round(
      (hasViewport ? 20 : 0) +
        (renderBlockingScripts < 5 ? 20 : 0) +
        (lazyImages > 0 ? 20 : 0) +
        (modernImageFormats > 0 ? 20 : 0) +
        (htmlBytes < 300000 ? 20 : 0),
    ),
    seo: Math.round((seoSignals.filter(Boolean).length / seoSignals.length) * 100),
    directPaths,
    ordering: {
      status: orderingStatus,
      summary: orderingSummary,
      primaryUrl: primaryOrderLink?.url ?? null,
      provider: primaryOrderLink?.provider ?? null,
      marketplaceProviders,
      directProviders,
      links: uniqueOrderLinks.slice(0, 12),
    },
    customerPaths,
    tracking,
    htmlAvailable: true,
    htmlSource: 'direct',
    fetchError: null,
    finalUrl: url,
    metaTags,
    headings: { h1, h2 },
    links: {
      internal,
      external,
      nofollow: linkRows.filter((link) => link.nofollow).length,
    },
    resources: {
      scripts: scriptRows.length,
      stylesheets: stylesheetRows.length,
      images: imageRows.length,
      fonts,
    },
    performanceSignals,
    openingHours: extractSchemaOpeningHours(schemaScripts, $),
  }
}

export function fallbackInterpretation(score: number, sections: AuditSection[]) { const relationship=sections.find(s=>s.key==='relationship'); const primaryLeak=relationship?.status==='bad' ? 'Your site may convert attention, but it does not yet show a clear path to recognize and reach the customer again.' : sections.find(s=>s.status==='bad')?.detail ?? 'The main relationship gap is still being measured.'; return { maturityStage: score >= 75 ? 'owned' : score >= 55 ? 'engaged' : score >= 35 ? 'reachable':'discoverable', executiveSummary:`Your Direct Relationship Score is ${score}/100. The report separates what was measured from what remains unknown so you can prioritize the next customer relationship move.`, primaryLeak, strengths: sections.filter(s=>s.status==='good').map(s=>s.label), priorities:[primaryLeak,'Make the next direct action obvious on mobile.','Add a visible way to capture and recognize the second order.'], reviewThemes:[], journey:{discovery:'Measured from Google profile and confirmed social presence.',conversion:'Measured from reachable website and observed customer paths.',retention:'Retention evidence is limited unless capture or loyalty paths are visible.'}, missingEvidence: sections.filter(s=>s.status==='unknown').map(s=>s.label), confidence: score >= 50 ? 'medium':'limited' } }
