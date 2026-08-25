import { NextResponse } from 'next/server'
import { customAlphabet } from 'nanoid'
import { guard, bad } from '@/lib/http'
import { db, firebaseConfigured } from '@/lib/firebase'
import { debugLog, debugError } from '@/lib/debug'

export const runtime = 'nodejs'

// Same safe alphabet + length as the previous project.
const newId = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 10)

function baseUrl(req: Request): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
  try {
    return new URL(req.url).origin
  } catch {
    return ''
  }
}

// Persist a completed audit and mint a shareable /r/{id} link. Best-effort from
// the client: if this fails the report still renders, only the share URL is lost.
export async function POST(req: Request) {
  const limited = guard(req, 20)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return bad('Invalid payload')

  const { detail, audit, lead } = body as { detail?: any; audit?: any; lead?: any }
  if (!audit?.result) return bad('Missing audit result')

  if (!firebaseConfigured()) {
    // Persistence is optional. Return a soft 200 so the client doesn't surface a
    // red console/network error — the report renders fine, only the shareable
    // /r/{id} link is skipped until Firebase env vars are set.
    debugLog('audits', 'Firebase not configured; skipping persistence (non-fatal)')
    return NextResponse.json({ id: null, url: null, persisted: false, reason: 'persistence_not_configured' })
  }

  const id = `aud_${newId()}`

  // Same broad schema as the old audit document for compatibility. The "report"
  // field already contains the normalized report from /api/direct-audit; we do
  // NOT duplicate raw provider payloads or store credentials.
  const doc = {
    placeId: detail?.placeId ?? audit?.restaurant?.placeId ?? null,
    business: detail ?? audit?.restaurant ?? null,
    competitors: [] as unknown[],
    scores: {
      overall: audit.result.score,
      coverage: audit.result.coverage,
      provisional: audit.result.provisional,
      sections: audit.result.sections,
    },
    report: audit,
    lead: lead
      ? { name: lead.name ?? null, email: lead.email ?? null, phone: lead.phone ?? null, role: lead.role ?? null }
      : null,
    createdAt: new Date().toISOString(),
  }

  try {
    await db().collection('audits').doc(id).set(doc)
    const url = `${baseUrl(req)}/r/${id}`
    debugLog('audits', 'Audit persisted', { id })
    return NextResponse.json({ id, url })
  } catch (error) {
    debugError('audits', 'Failed to persist audit', error)
    return bad('Failed to persist audit', 500)
  }
}
