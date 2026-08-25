import { NextRequest, NextResponse } from 'next/server'
import { fetchWebsiteHtml } from '@/lib/audit'
import { extractSocialLinks, discoverBrandAssets, discoverVerifiedSocialsFromSearch, type BrandAsset, type DiscoveredSocials } from '@/lib/social'
import { debugError, debugLog, elapsed, startedAt } from '@/lib/debug'

export const runtime = 'nodejs'
export const maxDuration = 30

// Platforms we always try to surface on the confirm screen; if the website
// doesn't link them, we fall back to a Google search so the owner can confirm.
const CORE_PLATFORMS = ['instagram', 'facebook', 'tiktok'] as const

type DiscoveryDiagnostics = {
  serpApiConfigured: boolean
  stages: string[]
  website: { requested: boolean; htmlAvailable: boolean; outcome: 'not_requested' | 'linked_website_read' | 'website_unavailable' | 'request_failed' }
  brandWebsite: { attempted: boolean; found: boolean; verification: string | null; assetCount: number; outcome: 'not_attempted' | 'candidate_found' | 'no_candidate' | 'request_failed' }
  socialSearch: { attempted: boolean; requestedPlatforms: string[]; foundPlatforms: string[]; outcome: 'not_attempted' | 'profiles_found' | 'no_verified_profiles' | 'request_failed' }
}

export async function GET(req: NextRequest) {
  const started = startedAt()
  const url = req.nextUrl.searchParams.get('url')
  const name = req.nextUrl.searchParams.get('name') ?? ''
  const address = req.nextUrl.searchParams.get('address') ?? ''
  let socials: DiscoveredSocials = {}
  let websiteUrl = ''
  let assets: BrandAsset[] = []
  let htmlAvailable = false
  const diagnostics: DiscoveryDiagnostics = {
    serpApiConfigured: Boolean(process.env.SERPAPI_API_KEY?.trim()),
    stages: [],
    website: { requested: Boolean(url), htmlAvailable: false, outcome: url ? 'website_unavailable' : 'not_requested' },
    brandWebsite: { attempted: false, found: false, verification: null, assetCount: 0, outcome: 'not_attempted' },
    socialSearch: { attempted: false, requestedPlatforms: [], foundPlatforms: [], outcome: 'not_attempted' },
  }
  // For a blank GMB website, run social discovery alongside the potential
  // website lookup. Waiting for the website before starting three provider
  // searches is what previously exceeded this route's 30-second budget.
  let verifiedSocialPromise: Promise<{ socials: DiscoveredSocials; assets: BrandAsset[] }> | null = null
  if (!url && name) {
    diagnostics.stages.push('social_search_started_in_parallel')
    diagnostics.socialSearch.attempted = true
    diagnostics.socialSearch.requestedPlatforms = [...CORE_PLATFORMS]
    verifiedSocialPromise = discoverVerifiedSocialsFromSearch(name, address, [...CORE_PLATFORMS])
  }
  try {
    if (url) {
      diagnostics.stages.push('google_linked_website_fetch')
      const fetched = await fetchWebsiteHtml(url)
      if (fetched.html) {
        htmlAvailable = true
        diagnostics.website.htmlAvailable = true
        diagnostics.website.outcome = 'linked_website_read'
        websiteUrl = fetched.finalUrl || url
        socials = extractSocialLinks(fetched.html, fetched.finalUrl || url)
        assets = [
          { kind: 'website', url: websiteUrl, source: 'gmb', verification: 'linked_on_gmb', confidence: 'high', evidence: ['Website is linked from the selected Google Business Profile'] },
          ...Object.entries(socials).map(([platform, socialUrl]) => ({ kind: 'social' as const, platform: platform as any, url: socialUrl, source: 'website' as const, verification: 'verified_brand_asset' as const, confidence: 'high' as const, evidence: ['Linked from the Google-linked restaurant website'] })),
        ]
      } else {
        diagnostics.website.outcome = 'website_unavailable'
        debugLog('social.discover', 'No HTML available for discovery', { url, error: fetched.error })
      }
    }
  } catch (error) {
    diagnostics.website.outcome = 'request_failed'
    debugError('social.discover', 'Website discovery failed', error, { url })
  }

  // A blank GMB website field is a different problem from a broken website.
  // Discover a brand candidate only in that blank state and preserve the source
  // so UI/report can clearly say it is missing from Google Business Profile.
  if (!url && name) {
    diagnostics.stages.push('brand_website_search')
    diagnostics.brandWebsite.attempted = true
    try {
      const discovered = await discoverBrandAssets(name, address)
      websiteUrl = discovered.website?.url ?? ''
      socials = discovered.socials
      assets = discovered.assets
      htmlAvailable = Boolean(discovered.website && discovered.website.verification !== 'candidate_needs_confirmation')
      diagnostics.brandWebsite.found = Boolean(discovered.website)
      diagnostics.brandWebsite.verification = discovered.website?.verification ?? null
      diagnostics.brandWebsite.assetCount = discovered.assets.length
      diagnostics.brandWebsite.outcome = discovered.website ? 'candidate_found' : 'no_candidate'
    } catch (error) {
      diagnostics.brandWebsite.outcome = 'request_failed'
      debugError('social.discover', 'Brand website discovery failed', error, { name })
    }
  }

  // If a GMB website was supplied, start the social lookup after inspecting it.
  // In the blank-website case it has already been running in parallel above.
  const missingCore = CORE_PLATFORMS.filter((p) => !socials[p])
  if (!verifiedSocialPromise && name && missingCore.length) {
    diagnostics.stages.push('social_search_after_website')
    diagnostics.socialSearch.attempted = true
    diagnostics.socialSearch.requestedPlatforms = [...missingCore]
    verifiedSocialPromise = discoverVerifiedSocialsFromSearch(name, address, [...missingCore])
  }
  if (verifiedSocialPromise) {
    try {
      const verified = await verifiedSocialPromise
      for (const [platform, link] of Object.entries(verified.socials)) {
        if (link && !socials[platform as keyof DiscoveredSocials]) socials[platform as keyof DiscoveredSocials] = link
      }
      assets.push(...verified.assets)
      diagnostics.socialSearch.foundPlatforms = Object.keys(verified.socials)
      diagnostics.socialSearch.outcome = diagnostics.socialSearch.foundPlatforms.length ? 'profiles_found' : 'no_verified_profiles'
    } catch (error) {
      diagnostics.socialSearch.outcome = 'request_failed'
      debugError('social.discover', 'Verified platform search failed', error, { name })
    }
  }

  diagnostics.stages.push('complete')
  debugLog('social.discover', 'Social profiles discovered', { url, name, websiteUrl, platforms: Object.keys(socials), assets: assets.length, diagnostics, duration: elapsed(started) })
  return NextResponse.json({ socials, websiteUrl, htmlAvailable, assets, diagnostics })
}
