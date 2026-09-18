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
      <Script id="meta-pixel" strategy="lazyOnload">
        {`window.fbq = window.fbq || function() {
  window.fbq.callMethod ? window.fbq.callMethod.apply(window.fbq, arguments) : window.fbq.queue.push(arguments)
};
window.fbq.queue = window.fbq.queue || [];
window.fbq('init', '2061786917743035');
window.fbq('track', 'PageView');`}
      </Script>
      <Script id="meta-pixel-src" src="https://connect.facebook.net/en_US/fbevents.js" strategy="lazyOnload" />
      <GoogleAnalytics measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
      <MicrosoftClarity projectId={process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID} enabled={process.env.NEXT_PUBLIC_ENABLE_CLARITY === 'true'} />
    </html>
  )
}
