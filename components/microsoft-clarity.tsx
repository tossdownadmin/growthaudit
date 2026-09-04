import Script from 'next/script'

const projectIdPattern = /^[a-z0-9]+$/i

export function MicrosoftClarity({ projectId }: { projectId?: string }) {
  const safeProjectId = projectId?.trim()
  if (!safeProjectId || !projectIdPattern.test(safeProjectId)) return null

  return (
    <Script id="microsoft-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window,document,"clarity","script",${JSON.stringify(safeProjectId)});`}
    </Script>
  )
}
