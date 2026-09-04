import type { Metadata } from 'next'
import { GoogleAnalytics } from '@/components/google-analytics'
import { MicrosoftClarity } from '@/components/microsoft-clarity'
import './globals.css'
export const metadata: Metadata={title:'Restaurant Growth Audit | tossdown',description:'See where your restaurant growth engine is working — and where customers, orders, and repeat visits are leaking.'}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className="bg-background"><body>{children}</body><GoogleAnalytics measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}/><MicrosoftClarity projectId={process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID}/></html>}
