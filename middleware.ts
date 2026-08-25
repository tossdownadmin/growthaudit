import { NextResponse, type NextRequest } from 'next/server'

// Optional API-origin allow-list (ported from the previous project). When
// ALLOWED_ORIGINS is blank, all origins are allowed so existing behavior and
// Vercel previews are never broken. Only enforced on /api/* cross-origin POSTs.
export function middleware(req: NextRequest) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (allowed.length === 0) return NextResponse.next()

  const origin = req.headers.get('origin')
  // Same-origin / no-origin requests (e.g. server, direct navigation) pass.
  if (!origin) return NextResponse.next()
  if (allowed.includes(origin)) return NextResponse.next()

  return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
}

export const config = {
  matcher: ['/api/:path*'],
}
