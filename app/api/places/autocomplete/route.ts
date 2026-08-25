import { NextRequest, NextResponse } from 'next/server'
import { debugError, debugLog, elapsed, startedAt } from '@/lib/debug'

export async function GET(req: NextRequest) {
  const started = startedAt()
  const input = req.nextUrl.searchParams.get('input')?.trim()
  const key = process.env.GOOGLE_PLACES_API_KEY
  debugLog('places.autocomplete', 'Request received', { inputLength: input?.length ?? 0, keyConfigured: Boolean(key) })
  if (!input) return NextResponse.json({ suggestions: [] })
  if (!key) {
    debugError('places.autocomplete', 'Google Places key is missing', new Error('GOOGLE_PLACES_API_KEY is not configured'))
    return NextResponse.json({ suggestions: [], error: 'GOOGLE_PLACES_API_KEY is not configured.' }, { status: 503 })
  }
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({ input, languageCode: 'en' }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      debugError('places.autocomplete', 'Google Places request failed', new Error(`HTTP ${response.status}`), { status: response.status, providerError: data?.error?.message })
      return NextResponse.json({ suggestions: [], error: 'Places search unavailable.' }, { status: 502 })
    }
    const suggestions = (data.suggestions ?? []).map((s: any) => { const p = s.placePrediction; return { placeId: p?.placeId, name: p?.structuredFormat?.mainText?.text ?? p?.text?.text ?? '', displayName: p?.structuredFormat?.mainText?.text ?? '', formattedAddress: p?.structuredFormat?.secondaryText?.text ?? '', types: p?.types ?? [] } })
    debugLog('places.autocomplete', 'Request completed', { suggestionCount: suggestions.length, duration: elapsed(started) })
    return NextResponse.json({ suggestions })
  } catch (error) {
    debugError('places.autocomplete', 'Unexpected request failure', error, { duration: elapsed(started) })
    return NextResponse.json({ suggestions: [], error: 'Places search unavailable.' }, { status: 502 })
  }
}
