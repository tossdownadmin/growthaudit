import { NextRequest, NextResponse } from 'next/server'
import { fetchWebsiteHtml } from '@/lib/audit'
import { extractSocialLinks, discoverSocialsFromGoogle, type DiscoveredSocials } from '@/lib/social'
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
  let htmlAvailable = false
  try {
    if (url) {
      const fetched = await fetchWebsiteHtml(url)
      if (fetched.html) {
        htmlAvailable = true
        socials = extractSocialLinks(fetched.html, fetched.finalUrl || url)
      } else {
        debugLog('social.discover', 'No HTML available for discovery', { url, error: fetched.error })
      }
    }
  } catch (error) {
    debugError('social.discover', 'Website discovery failed', error, { url })
  }

  // Google fallback when the site is missing any core platform. Merged so
  // website-found links always win; Google only fills the gaps.
  const missingCore = CORE_PLATFORMS.filter((p) => !socials[p])
  if (name && missingCore.length) {
    try {
      const fromGoogle = await discoverSocialsFromGoogle(name, address)
      for (const [platform, link] of Object.entries(fromGoogle)) {
        if (link && !socials[platform as keyof DiscoveredSocials]) socials[platform as keyof DiscoveredSocials] = link
      }
    } catch (error) {
      debugError('social.discover', 'Google fallback failed', error, { name })
    }
  }

  debugLog('social.discover', 'Social profiles discovered', { url, name, platforms: Object.keys(socials), duration: elapsed(started) })
  return NextResponse.json({ socials, htmlAvailable })
}
