type AuditEmailInput = {
  recipientName?: unknown
  restaurantName?: unknown
  score?: unknown
  rank?: unknown
  rating?: unknown
  reviews?: unknown
  opportunities?: unknown
  startHere?: unknown
  reportUrl?: unknown
}

export type RenderedAuditEmail = {
  subject: string
  html: string
  text: string
}

const REPORT_ORIGIN = 'https://growthaudit.tossdown.com'
const BOOKING_URL = 'https://tossdown.com/book-a-strategy-call'

function text(value: unknown, max = 240): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function possessive(value: string): string {
  return /s$/i.test(value) ? `${value}'` : `${value}'s`
}

function canonicalReportUrl(value: unknown): string {
  const raw = text(value, 500)
  try {
    const url = new URL(raw)
    return url.origin === REPORT_ORIGIN && /^\/r\/aud_[23456789abcdefghijkmnpqrstuvwxyz]{10}$/.test(url.pathname)
      ? url.toString()
      : ''
  } catch {
    return ''
  }
}

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => text(item)).filter(Boolean))].slice(0, 3)
    : []
}

const alertIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="width:16px;height:16px;color:#B80F40;flex:none;margin-top:2px"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>'
const bulbIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="width:18px;height:18px;color:#F0C879;flex:none;margin-top:2px"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.05V17h6v-.25c0-.85.4-1.55 1-2.05A7 7 0 0 0 12 2Z"/></svg>'

export function buildAuditEmail(input: AuditEmailInput): RenderedAuditEmail | null {
  const fullName = text(input.recipientName, 120)
  const firstName = fullName.split(/\s+/)[0]
  const restaurantName = text(input.restaurantName, 160)
  const scoreValue = number(input.score)
  const reportUrl = canonicalReportUrl(input.reportUrl)
  if (!firstName || !restaurantName || scoreValue === null || !reportUrl) return null

  const score = Math.max(0, Math.min(100, Math.round(scoreValue)))
  const rank = number(input.rank)
  const rating = number(input.rating)
  const reviews = number(input.reviews)
  const opportunities = list(input.opportunities)
  const startHere = text(input.startHere)
  const restaurantPossessive = possessive(restaurantName)
  const subject = `${firstName}, ${restaurantName} scored ${score}/100. Here's what's costing you orders.`

  const opportunityRows = opportunities
    .map((opportunity) => `<div class="opp-row">${alertIcon}${escapeHtml(opportunity)}</div>`)
    .join('')
  const rankRow = rank !== null && rank > 0 ? `<div class="rank">#${Math.round(rank)} local rank</div>` : ''
  const ratingParts = [
    rating !== null ? `${rating.toFixed(1)} ★` : '',
    reviews !== null ? `${Math.max(0, Math.round(reviews)).toLocaleString('en-US')} reviews` : '',
  ].filter(Boolean)
  const statRight = rankRow || ratingParts.length
    ? `<div class="stat-right">${rankRow}${ratingParts.length ? `<div class="rating">${ratingParts.join(' &nbsp;&middot;&nbsp; ')}</div>` : ''}</div>`
    : ''
  const startHereBlock = startHere
    ? `<div class="start-here">${bulbIcon}<p><b>Start here:</b> ${escapeHtml(startHere)} <span>Full plan in your report.</span></p></div>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escapeHtml(subject)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#EFEAE1;font-family:Arial,Helvetica,sans-serif;color:#241B16;padding:36px 16px}.email{max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 14px 36px -20px rgba(36,27,22,.28)}.banner{background:linear-gradient(120deg,#E51451,#B80F40);padding:22px 28px;display:flex;align-items:center;justify-content:space-between}.banner img{height:20px;filter:brightness(0) invert(1)}.banner span{color:#FBC7D6;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}.body{padding:32px 30px 8px}.greeting{font-size:24px;font-weight:800;line-height:1.25;margin:0}.greeting b{color:#B80F40}.stat-card{margin-top:24px;background:#241B16;border-radius:14px;padding:22px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;color:#fff}.stat-left span{display:block;font-size:11px;letter-spacing:.06em;color:#C9BBA9;text-transform:uppercase;font-weight:700}.stat-left strong{font-size:34px;font-weight:800}.stat-left small{font-size:16px;color:#C9BBA9}.stat-right{text-align:right;font-size:13px}.rank{color:#F0C879;font-weight:700}.rating{margin-top:6px;color:#E4DBCB}.opps-label{margin-top:26px;font-size:12px;font-weight:700;color:#6E6153;letter-spacing:.05em;text-transform:uppercase}.opp-row{margin-top:10px;background:#FDEAF0;border-radius:10px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.5}.start-here{margin-top:18px;background:#241B16;border-radius:12px;padding:16px 18px;display:flex;gap:12px;align-items:flex-start}.start-here p{font-size:14px;line-height:1.55;color:#EFE6D8;margin:0}.start-here p b{color:#fff}.start-here p span{color:#B8AA96}.cta-primary{display:block;text-align:center;margin:26px 0 12px;background:#E51451;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:15px;border-radius:12px}.cta-secondary{text-align:center;font-size:14px;color:#6E6153;margin-bottom:28px}.cta-secondary a{color:#B80F40;font-weight:700;text-decoration:none}.signoff{padding:0 30px 26px;border-top:1px solid #EBE0CE;margin-top:6px}.signoff p{font-size:14px;line-height:1.6;color:#6E6153;margin-top:20px}.signoff .sign{margin-top:14px;font-size:14px}.signoff .sign b{display:block}.signoff .ps{font-size:13px;font-style:italic}.footer{padding:20px 30px;background:#F7F1E6;text-align:center;font-size:12px;color:#9C8E7C;line-height:1.6}.footer a{color:#9C8E7C}@media(max-width:480px){body{padding:0}.email{border-radius:0}.banner,.body,.signoff{padding-left:20px;padding-right:20px}.stat-right{text-align:left}}
</style></head><body><div class="email">
<div class="banner"><img src="${REPORT_ORIGIN}/tossdown-logo.png" alt="tossdown"/><span>Restaurant Intelligence</span></div>
<div class="body"><p class="greeting">Hey ${escapeHtml(firstName)}, <b>${escapeHtml(restaurantPossessive)}</b> audit is ready.</p>
<div class="stat-card"><div class="stat-left"><span>Digital Readiness</span><strong>${score}<small>/100</small></strong></div>${statRight}</div>
${opportunityRows ? `<p class="opps-label">Your biggest opportunities</p>${opportunityRows}` : ''}${startHereBlock}
<a href="${reportUrl}" class="cta-primary">View your full report &rarr;</a><p class="cta-secondary">Prefer to talk? <a href="${BOOKING_URL}">Book a call &rarr;</a></p></div>
<div class="signoff"><p>Built from ${escapeHtml(restaurantPossessive)} own Google listing, website, and reviews.</p><div class="sign"><b>Shahzeb Rizvi</b>CEO - tossdown</div><p class="ps">P.S. Reply if anything looks off. I read these myself.</p></div>
<div class="footer">You're receiving this because you ran a free audit at <a href="${REPORT_ORIGIN}">growthaudit.tossdown.com</a>.<br/>tossdown, one platform built for restaurants.</div>
</div></body></html>`

  const textBody = [
    `Hey ${firstName}, ${restaurantPossessive} audit is ready.`,
    `Digital Readiness: ${score}/100`,
    rank !== null && rank > 0 ? `Local rank: #${Math.round(rank)}` : '',
    ratingParts.length ? ratingParts.join(' · ') : '',
    opportunities.length ? `Your biggest opportunities:\n${opportunities.map((item) => `- ${item}`).join('\n')}` : '',
    startHere ? `Start here: ${startHere}` : '',
    `View your full report: ${reportUrl}`,
    `Book a call: ${BOOKING_URL}`,
  ].filter(Boolean).join('\n\n')

  return { subject, html, text: textBody }
}
