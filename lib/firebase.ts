import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

// Server-side Firebase Admin singleton (ported verbatim from the previous
// Tossdown audit project). NEVER import this from client components.
let _db: Firestore | null = null

// Whether Firebase Admin credentials are configured. Persistence is best-effort,
// so callers should degrade gracefully when this is false.
export function firebaseConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  )
}

export function db(): Firestore {
  if (_db) return _db

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    })
  }

  _db = getFirestore()

  try {
    _db.settings({ ignoreUndefinedProperties: true })
  } catch {
    // settings can only be applied once; ignore repeat calls
  }

  return _db
}
