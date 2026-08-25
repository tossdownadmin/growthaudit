import { NextResponse } from 'next/server'
import { guard, bad } from '@/lib/http'
import { db, firebaseConfigured } from '@/lib/firebase'
import { upsertGhlContact } from '@/lib/ghl'
import { debugLog, debugError } from '@/lib/debug'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Lead capture + CRM sync. Persistence is SECONDARY to delivering the audit, so
// every side effect here is best-effort and failures never bubble to the client
// as a hard error that would block the audit flow.
export async function POST(req: Request) {
  const limited = guard(req, 10)
  if (limited) return limited

  // Optional server-to-server secret. Left unset for the browser flow.
  const secret = process.env.LEAD_SUBMIT_SECRET
  if (secret && req.headers.get('x-submit-secret') !== secret) {
    return bad('Forbidden', 403)
  }

  const lead = await req.json().catch(() => null)
  if (!lead || typeof lead !== 'object') return bad('Invalid payload')
  if (!lead.email || !EMAIL_RE.test(String(lead.email))) return bad('Valid email required')

  const submissionId = lead.submissionId ? String(lead.submissionId) : null
  const payload = { ...lead, source: 'tdaudit', capturedAt: new Date().toISOString() }

  // 1) Save/merge lead in Firestore (best-effort).
  if (firebaseConfigured()) {
    try {
      if (submissionId) {
        await db().collection('leads').doc(submissionId).set(payload, { merge: true })
      } else {
        await db().collection('leads').add(payload)
      }
      debugLog('lead', 'Lead saved to Firestore', { submissionId, merged: Boolean(submissionId) })
    } catch (error) {
      debugError('lead', 'Firestore lead save failed', error)
    }
  } else {
    debugLog('lead', 'Firebase not configured; skipping Firestore save')
  }

  // 2) Optional webhook (best-effort, failures ignored).
  if (process.env.LEAD_WEBHOOK_URL) {
    try {
      await fetch(process.env.LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (error) {
      debugError('lead', 'Lead webhook failed (ignored)', error)
    }
  }

  // 3) GHL upsert (best-effort). A GHL failure must NOT return 500.
  try {
    const result = await upsertGhlContact(lead)
    if (!result.ok && result.error !== 'not_configured') {
      debugError('lead', 'GHL upsert failed (ignored)', new Error(result.error || 'unknown'))
    } else if (result.ok) {
      debugLog('lead', 'GHL contact upserted')
    }
  } catch (error) {
    debugError('lead', 'GHL upsert threw (ignored)', error)
  }

  return NextResponse.json({ ok: true })
}
