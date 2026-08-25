import { NextRequest, NextResponse } from 'next/server'
import { debugError, debugLog, elapsed, startedAt } from '@/lib/debug'

export async function GET(req: NextRequest) {
  const started = startedAt()
  const id = req.nextUrl.searchParams.get('placeId')
  const key = process.env.GOOGLE_PLACES_API_KEY
  debugLog('places.details', 'Request received', { placeId: id, keyConfigured: Boolean(key) })
  if (!id || !key) {
    debugError('places.details', 'Request unavailable', new Error(!id ? 'Place ID is missing' : 'Google Places key is missing'), { hasPlaceId: Boolean(id), keyConfigured: Boolean(key) })
    return NextResponse.json({ error: 'Place details are unavailable.' }, { status: 503 })
  }
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,websiteUri,googleMapsUri,rating,userRatingCount,types,primaryType,priceLevel,reviews,regularOpeningHours' } })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      debugError('places.details', 'Google Places request failed', new Error(`HTTP ${response.status}`), { status: response.status, providerError: data?.error?.message, duration: elapsed(started) })
      return NextResponse.json({ error: 'Could not load this location.' }, { status: 502 })
    }
    // Google returns one description per day ("Monday: 9 AM–5 PM" / "Sunday: Closed").
    // daysOpen counts the days that actually have hours so we can compare the number
    // of open days on Google against the number published on the restaurant's site.
    const weekdayDescriptions: string[] = Array.isArray(data.regularOpeningHours?.weekdayDescriptions) ? data.regularOpeningHours.weekdayDescriptions : []
    const daysOpen = weekdayDescriptions.length ? weekdayDescriptions.filter((d: string) => !/closed/i.test(d)).length : null
    const openingHours = weekdayDescriptions.length ? { daysOpen, weekdayDescriptions } : null
    debugLog('places.details', 'Request completed', { placeId: id, hasWebsite: Boolean(data.websiteUri), daysOpen, duration: elapsed(started) })
    return NextResponse.json({ placeId: data.id, name: data.displayName?.text ?? '', address: data.formattedAddress ?? '', lat: data.location?.latitude, lng: data.location?.longitude, websiteUrl: data.websiteUri ?? '', googleWebsiteUrl: data.websiteUri ?? '', googleMapsUri: data.googleMapsUri ?? '', rating: data.rating ?? null, reviewCount: data.userRatingCount ?? null, types: data.types ?? [], primaryType: data.primaryType ?? '', priceLevel: data.priceLevel ?? null, reviews: data.reviews ?? [], openingHours, socials: {} })
  } catch (error) {
    debugError('places.details', 'Unexpected request failure', error, { duration: elapsed(started) })
    return NextResponse.json({ error: 'Could not load this location.' }, { status: 502 })
  }
}
