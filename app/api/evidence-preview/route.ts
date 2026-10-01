import { NextRequest, NextResponse } from 'next/server'
import dns from 'node:dns/promises'
import net from 'node:net'

export const runtime = 'nodejs'
export const maxDuration = 60

async function capture(url: string, token: string) {
  if (!token) return { image: null, status: 'not_configured' }
  if (!(await isSafePublicUrl(url))) return { image: null, status: 'invalid_url' }
  try {
    const endpoint = new URL('https://production-sfo.browserless.io/screenshot')
    endpoint.searchParams.set('token', token)
    const response = await fetch(endpoint, {method:'POST',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json'},body:JSON.stringify({url,viewport:{width:390,height:844,isMobile:true,deviceScaleFactor:1},options:{type:'jpeg',quality:68,fullPage:false},gotoOptions:{waitUntil:'domcontentloaded',timeout:15000},waitForTimeout:4000})})
    if (!response.ok) {
      console.warn('[evidence-preview] Screenshot provider rejected capture', {status:response.status})
      return {image:null,status:`provider_${response.status}`}
    }
    if (!response.headers.get('content-type')?.startsWith('image/')) return {image:null,status:'invalid_image'}
    const bytes = Buffer.from(await response.arrayBuffer())
    return bytes.length ? {image:`data:image/jpeg;base64,${bytes.toString('base64')}`,status:'ready'} : {image:null,status:'empty_image'}
  } catch { return {image:null,status:'capture_failed'} }
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
  if (!body || typeof body !== 'object') return NextResponse.json({error:'Invalid request'}, {status:400})
  if (body.kind === 'website' || body.kind === 'social') {
    return NextResponse.json(typeof body.url === 'string' ? await capture(body.url, process.env.BROWSERLESS_TOKEN || '') : {image:null,status:'missing_url'})
  }
  if (body.kind === 'map') {
    const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY
    const {lat,lng} = body
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) return NextResponse.json({image:null,status:'missing_location'})
    if (!key) return NextResponse.json({image:null,status:'not_configured'})
    const url = new URL('https://maps.googleapis.com/maps/api/staticmap')
    url.search = new URLSearchParams({center:`${lat},${lng}`,zoom:'14',size:'640x480',scale:'2',maptype:'roadmap',markers:`color:red|${lat},${lng}`,key}).toString()
    try {
      const response = await fetch(url,{signal:AbortSignal.timeout(12000)})
      const mime = response.headers.get('content-type') || ''
      if (!response.ok || !mime.startsWith('image/')) {
        console.warn('[evidence-preview] Map provider rejected capture',{status:response.status})
        return NextResponse.json({image:null,status:`provider_${response.status}`})
      }
      return NextResponse.json({image:`data:${mime};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`,status:'ready'})
    } catch {return NextResponse.json({image:null,status:'capture_failed'})}
  }
  const candidates = [body.websiteUrl, ...Object.values(body.socials || {})].filter((value): value is string => typeof value === 'string').slice(0, 4)
  const allowed = await Promise.all(candidates.map(async url => (await isSafePublicUrl(url)) ? url : null))
  const urls = allowed.filter((url): url is string => Boolean(url))
  const captures = await Promise.all(urls.map(url => capture(url, process.env.BROWSERLESS_TOKEN || '')))
  const mapKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || ''
  const lat = Number(body.lat); const lng = Number(body.lng)
  const map = mapKey && Number.isFinite(lat) && Number.isFinite(lng) ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=13&size=720x420&scale=2&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(mapKey)}` : null
  return NextResponse.json({website: captures[0]?.image || null, socials: captures.slice(1).map(c=>c.image).filter(Boolean), map})
}
