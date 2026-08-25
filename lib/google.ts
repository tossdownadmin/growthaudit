// Shared Google Places (New) client. Key is read server-side only.
const KEY = (process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "");
const BASE = "https://places.googleapis.com/v1";

export async function placesGet(path: string, fieldMask: string) {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": fieldMask },
  });
  if (!res.ok) throw new Error(`Places ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function placesPost(path: string, fieldMask: string, body: unknown) {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Places ${res.status}: ${await res.text()}`);
  return res.json();
}
