import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { SharedReport } from './shared-report'

export const dynamic = 'force-dynamic'

async function baseUrl() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : ''
}

async function fetchAudit(id: string) {
  const base = await baseUrl()
  try {
    const res = await fetch(`${base}/api/audits/${id}`, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const data = await fetchAudit(id)
  const name = data?.business?.name ?? 'Restaurant'
  const score = data?.scores?.overall ?? data?.report?.result?.score
  const title = `${name} — Restaurant Growth Audit`
  const description = score != null
    ? `${name} scored ${score}/100 on restaurant growth-engine readiness. See the full audit.`
    : `Restaurant growth audit for ${name}.`
  return { title, description, openGraph: { title, description }, twitter: { card: 'summary_large_image', title, description } }
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await fetchAudit(id)
  if (!data?.report?.result) notFound()
  return <SharedReport audit={data.report} />
}
