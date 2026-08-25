/**
 * Evidence contract for customer-facing audit decisions.
 * Unknown data is never a pass and never a failure.
 */

export type EvidenceStatus = "verified" | "opportunity" | "unavailable"

export type AuditEvidence = {
  status: EvidenceStatus
  confidence: number
  title: string
  finding: string
  evidence: string[]
  value?: string | number | null
  impact?: string
}

export function verified(title: string, finding: string, evidence: string[] = [], value?: any): AuditEvidence {
  return { status: "verified", confidence: evidence.length ? 90 : 75, title, finding, evidence, value: value ?? null }
}

export function opportunity(title: string, finding: string, evidence: string[] = [], impact?: string): AuditEvidence {
  return { status: "opportunity", confidence: evidence.length ? 85 : 70, title, finding, evidence, impact }
}

export function unavailable(title: string, finding: string): AuditEvidence {
  return { status: "unavailable", confidence: 0, title, finding, evidence: [] }
}

export function hasReliableEvidence(item: AuditEvidence | null | undefined) {
  return Boolean(item && item.status !== "unavailable" && item.confidence >= 50)
}
