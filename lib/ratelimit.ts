// Simple in-memory fixed-window limiter (ported from the previous project).
// Suitable for best-effort protection of the lead/audit persistence routes only.
const hits = new Map<string, { count: number; reset: number }>()

export function rateLimit(ip: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || now > entry.reset) {
    hits.set(ip, { count: 1, reset: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count += 1
  return true
}
