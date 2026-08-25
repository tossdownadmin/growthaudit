import { NextResponse } from 'next/server'
import { guard, bad } from '@/lib/http'
import { db, firebaseConfigured } from '@/lib/firebase'
import { debugError } from '@/lib/debug'

export const runtime = 'nodejs'

// Public share endpoint. Returns the stored audit WITHOUT the lead/contact info,
// matching the previous project's privacy behavior.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = guard(req, 60)
  if (limited) return limited

  const { id } = await params
  if (!id) return bad('Missing id')
  if (!firebaseConfigured()) return bad('Not found', 404)

  try {
    const snap = await db().collection('audits').doc(id).get()
    if (!snap.exists) return bad('Not found', 404)
    const data = snap.data() as any

    // Intentionally omit `lead` from the public payload.
    return NextResponse.json({
      id,
      place_id: data.placeId ?? null,
      business: data.business ?? null,
      competitors: data.competitors ?? [],
      scores: data.scores ?? null,
      report: data.report ?? null,
      created_at: data.createdAt ?? null,
    })
  } catch (error) {
    debugError('audits.get', 'Failed to read audit', error)
    return bad('Not found', 404)
  }
}
