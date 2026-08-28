'use client'

type AnalyticsValue = string | number | boolean
type AnalyticsEvent =
  | 'restaurant_selected'
  | 'audit_started'
  | 'generate_lead'
  | 'audit_completed'
  | 'report_shared'

type GtagWindow = Window & {
  gtag?: (command: 'event', eventName: AnalyticsEvent, parameters?: Record<string, AnalyticsValue>) => void
}

/**
 * Sends only allow-listed, non-identifying audit funnel data to GA4. It is safe
 * to call before the tag is ready or when GA4 is not configured.
 */
export function trackAuditEvent(eventName: AnalyticsEvent, parameters: Record<string, AnalyticsValue> = {}) {
  if (typeof window === 'undefined') return
  ;(window as GtagWindow).gtag?.('event', eventName, parameters)
}
