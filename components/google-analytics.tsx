import Script from 'next/script'

const measurementIdPattern = /^G-[A-Z0-9]+$/

export function GoogleAnalytics({ measurementId }: { measurementId?: string }) {
  const safeMeasurementId = measurementId?.trim().toUpperCase()
  if (!safeMeasurementId || !measurementIdPattern.test(safeMeasurementId)) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${safeMeasurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(safeMeasurementId)});`}
      </Script>
    </>
  )
}
