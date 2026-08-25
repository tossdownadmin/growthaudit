// GoHighLevel contact upsert (ported verbatim from the previous Tossdown audit
// project). Uses CONTACT UPSERT so the same email/phone updates the same contact.
// Best-effort: never throws, never blocks the audit experience.

type ReportSummary = {
  score?: number | null
  rank?: number | null
  rating?: number | null
  reviews?: number | null
  topGaps?: string | null
}

type Lead = {
  name?: string
  email?: string
  phone?: string
  role?: string
  reportUrl?: string
  reportSummary?: ReportSummary
}

export function ghlConfigured(): boolean {
  return Boolean(process.env.GHL_PIT_TOKEN && process.env.GHL_LOCATION_ID)
}

export async function upsertGhlContact(lead: Lead): Promise<{ ok: boolean; error?: string }> {
  if (!ghlConfigured()) return { ok: false, error: 'not_configured' }

  const name = (lead.name || '').trim()
  const parts = name.split(/\s+/).filter(Boolean)
  const firstName = parts[0] || ''
  const lastName = parts.slice(1).join(' ')

  const rs: ReportSummary = lead.reportSummary || {}

  // BARE custom field keys, NOT contact.* display keys. Do not invent field IDs.
  const cf: Array<{ key: string; field_value: string }> = []
  if (lead.reportUrl) cf.push({ key: 'audit_report_url', field_value: lead.reportUrl })
  if (rs.score != null) cf.push({ key: 'audit_score', field_value: String(rs.score) })
  // This Direct Relationship Audit has no competitor ranking, so rank is normally
  // absent. Kept for backwards-compatibility with the old GHL field.
  if (rs.rank) cf.push({ key: 'audit_rank', field_value: String(rs.rank) })
  if (rs.rating != null) cf.push({ key: 'audit_rating', field_value: String(rs.rating) })
  if (rs.reviews != null) cf.push({ key: 'audit_reviews', field_value: String(rs.reviews) })
  if (rs.topGaps) cf.push({ key: 'audit_top_gaps', field_value: String(rs.topGaps) })

  const payload: Record<string, unknown> = {
    locationId: process.env.GHL_LOCATION_ID,
    firstName,
    lastName,
    email: lead.email,
    phone: lead.phone,
    source: 'tossdown Audit',
    tags: ['Audit Tool'],
    customFields: cf,
  }

  try {
    const res = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GHL_PIT_TOKEN}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `http_${res.status}${text ? `:${text.slice(0, 200)}` : ''}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'unknown' }
  }
}

// Robustly build the "top 3 relationship gaps" string from AI priorities, which
// may be strings or objects, falling back to primaryLeak when sparse.
export function buildTopGaps(interpretation: any): string {
  const priorities: any[] = Array.isArray(interpretation?.priorities) ? interpretation.priorities : []
  const gaps = priorities
    .slice(0, 3)
    .map((p) => (typeof p === 'string' ? p : p?.title || p?.action || p?.whyItMatters || ''))
    .filter(Boolean)
  if (gaps.length < 3 && interpretation?.primaryLeak) {
    const leak = typeof interpretation.primaryLeak === 'string' ? interpretation.primaryLeak : interpretation.primaryLeak?.title
    if (leak && !gaps.includes(leak)) gaps.push(leak)
  }
  return gaps.join(' · ')
}
