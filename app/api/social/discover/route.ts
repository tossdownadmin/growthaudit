import { NextRequest, NextResponse } from 'next/server'
import { fetchWebsiteHtml } from '@/lib/audit'
import { extractSocialLinks, discoverBrandAssets, discoverSocialsFromGoogle, discoverVerifiedSocialsFromSearch, type BrandAsset, type DiscoveredSocials } from '@/lib/social'
import { debugError, debugLog, elapsed, startedAt } from '@/lib/debug'

export const runtime = 'nodejs'
export const maxDuration = 30

// Platforms we always try to surface on the confirm screen; if the website
// doesn't link them, we fall back to a Google search so the owner can confirm.
const CORE_PLATFORMS = ['instagram', 'facebook', 'tiktok'] as const

export async function GET(req: NextRequest) {
  const started = startedAt()
  const url = req.nextUrl.searchParams.get('url')
  const name = req.nextUrl.searchParams.get('name') ?? ''
  const address = req.nextUrl.searchParams.get('address') ?? ''
  let socials: DiscoveredSocials = {}
  let websiteUrl = ''
  let assets: BrandAsset[] = []
  let htmlAvailable = false
  try {
    if (url) {
      const fetched = await fetchWebsiteHtml(url)
      if (fetched.html) {
        htmlAvailable = true
        websiteUrl = fetched.finalUrl || url
        socials = extractSocialLinks(fetched.html, fetched.finalUrl || url)
        assets = [
          { kind: 'website', url: websiteUrl, source: 'gmb', verification: 'linked_on_gmb', confidence: 'high', evidence: ['Website is linked from the selected Google Business Profile'] },
          ...Object.entries(socials).map(([platform, socialUrl]) => ({ kind: 'social' as const, platform: platform as any, url: socialUrl, source: 'website' as const, verification: 'verified_brand_asset' as const, confidence: 'high' as const, evidence: ['Linked from the Google-linked restaurant website'] })),
        ]
      } else {
        debugLog('social.discover', 'No HTML available for discovery', { url, error: fetched.error })
      }
    }
  } catch (error) {
    debugError('social.discover', 'Website discovery failed', error, { url })
  }

  // A blank GMB website field is a different problem from a broken website.
  // Discover a brand candidate only in that blank state and preserve the source
  // so UI/report can clearly say it is missing from Google Business Profile.
  if (!url && name) {
    try {
      const discovered = await discoverBrandAssets(name, address)
      websiteUrl = discovered.website?.url ?? ''
      socials = discovered.socials
      assets = discovered.assets
      htmlAvailable = Boolean(discovered.website && discovered.website.verification !== 'candidate_needs_confirmation')
    } catch (error) {
      debugError('social.discover', 'Brand website discovery failed', error, { name })
    }
  }

  // Search every missing core platform even when no website was found. A
  // chain-level official profile is verified independently of website discovery.
  const missingCore = CORE_PLATFORMS.filter((p) => !socials[p])
  if (name && missingCore.length) {
    try {
      const verified = await discoverVerifiedSocialsFromSearch(name, address, [...missingCore])
      for (const [platform, link] of Object.entries(verified.socials)) {
        if (link && !socials[platform as keyof DiscoveredSocials]) socials[platform as keyof DiscoveredSocials] = link
      }
      assets.push(...verified.assets)
    } catch (error) {
      debugError('social.discover', 'Verified platform search failed', error, { name })
    }
  }

  // Broad discovery remains a confirmation-only fallback. It never overrides
  // website-linked or platform-verified profiles above.
  const remainingCore = CORE_PLATFORMS.filter((p) => !socials[p])
  if (name && remainingCore.length) {
    try {
      const fromGoogle = await discoverSocialsFromGoogle(name, address)
      for (const [platform, link] of Object.entries(fromGoogle)) {
        if (link && !socials[platform as keyof DiscoveredSocials]) {
          socials[platform as keyof DiscoveredSocials] = link
          assets.push({ kind: 'social', platform: platform as any, url: link, source: 'search', verification: 'candidate_needs_confirmation', confidence: 'limited', evidence: ['Found in brand search; owner confirmation required'] })
        }
      }
    } catch (error) {
      debugError('social.discover', 'Google fallback failed', error, { name })
    }
  }

  debugLog('social.discover', 'Social profiles discovered', { url, name, websiteUrl, platforms: Object.keys(socials), assets: assets.length, duration: elapsed(started) })
  return NextResponse.json({ socials, websiteUrl, htmlAvailable, assets })
}
