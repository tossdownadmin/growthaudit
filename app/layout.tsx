import type { Metadata } from 'next'
import Script from 'next/script'
import { GoogleAnalytics } from '@/components/google-analytics'
import { MicrosoftClarity } from '@/components/microsoft-clarity'
import './globals.css'

export const metadata: Metadata = { title: 'Restaurant Growth Audit | tossdown', description: 'See where your restaurant growth engine is working — and where customers, orders, and repeat visits are leaking.' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-background">
      <body>
        {children}
        <noscript><img height="1" width="1" style={{ display: 'none' }} src="https://www.facebook.com/tr?id=2061786917743035&ev=PageView&noscript=1" /></noscript>
      </body>
      <Script id="meta-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');fbq('init', '2061786917743035');fbq('track', 'PageView');" }} />
      <GoogleAnalytics measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
      <MicrosoftClarity projectId={process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID} />
    </html>
  )
}
