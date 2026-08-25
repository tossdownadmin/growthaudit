'use client'
import { Report } from '@/components/audit-report'

// Public, read-only view of a saved audit. "Reset" sends the visitor to the
// homepage to run their own audit rather than clearing local state.
export function SharedReport({ audit }: { audit: any }) {
  return <Report audit={audit} onReset={() => { window.location.href = '/' }} />
}
