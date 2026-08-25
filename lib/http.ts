import { NextResponse } from 'next/server'
import { rateLimit } from './ratelimit'

// Best-effort client IP extraction from standard proxy headers.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') || '0.0.0.0'
}

// Returns a 429 response when the caller exceeds the limit, otherwise null.
export function guard(req: Request, limit: number): NextResponse | null {
  const ip = clientIp(req)
  if (!rateLimit(ip, limit)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  return null
}

export function bad(msg: string, status = 400): NextResponse {
  return NextResponse.json({ error: msg }, { status })
}
