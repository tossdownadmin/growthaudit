import { NextRequest, NextResponse } from 'next/server'
import dns from 'node:dns/promises'
import net from 'node:net'

export const runtime = 'nodejs'

async function capture(url: string, token: string) {
  if (!token || !(await isSafePublicUrl(url))) return null
  try {
    const endpoint = new URL('https://production-sfo.browserless.io/screenshot')
    endpoint.searchParams.set('token', token)
    const response = await fetch(endpoint, {method:'POST',signal:AbortSignal.timeout(18000),headers:{'Content-Type':'application/json'},body:JSON.stringify({url,options:{type:'jpeg',quality:68,fullPage:false,viewport:{width:390,height:844}}})})
    if (!response.ok) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    return bytes.length ? `data:image/jpeg;base64,${bytes.toString('base64')}` : null
  } catch { return null }
}

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a,b,c,d] = address.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) || (a === 198 && b >= 18 && b <= 19) || a >= 224
  }
  if (!net.isIPv6(address)) return true
  const normalized = address.toLowerCase()
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') ||
    normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
    normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('ff') ||
    normalized.startsWith('::ffff:') && isPrivateIp(normalized.slice(7))
}

async function isSafePublicUrl(value: string) {
  try {
    const parsed = new URL(value)
    const host = parsed.hostname.toLowerCase()
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false
    if (net.isIP(host)) return !isPrivateIp(host)
    const resolved = await dns.lookup(host, {all:true, verbatim:true})
    return resolved.length > 0 && resolved.every(({address}) => !isPrivateIp(address))
  } catch { return false }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const candidates = [body.websiteUrl, ...Object.values(body.socials || {})].filter((value): value is string => typeof value === 'string').slice(0, 4)
  const allowed = await Promise.all(candidates.map(async url => (await isSafePublicUrl(url)) ? url : null))
  const urls = allowed.filter((url): url is string => Boolean(url))
  const captures = await Promise.all(urls.map(url => capture(url, process.env.BROWSERLESS_TOKEN || '')))
  const mapKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || ''
  const lat = Number(body.lat); const lng = Number(body.lng)
  const map = mapKey && Number.isFinite(lat) && Number.isFinite(lng) ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=13&size=720x420&scale=2&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(mapKey)}` : null
  return NextResponse.json({website: captures[0] || null, socials: captures.slice(1).filter(Boolean), map})
}
