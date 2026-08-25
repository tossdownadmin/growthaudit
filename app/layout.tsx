import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
const geist=Geist({subsets:['latin'],variable:'--font-geist'}); const mono=Geist_Mono({subsets:['latin'],variable:'--font-mono'})
export const metadata: Metadata={title:'Restaurant Growth Audit | tossdown',description:'See where your restaurant growth engine is working — and where customers, orders, and repeat visits are leaking.'}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className="bg-background"><body className={`${geist.variable} ${mono.variable}`}>{children}</body></html>}
