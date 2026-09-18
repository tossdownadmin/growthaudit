import Script from 'next/script'

const projectIdPattern = /^[a-z0-9]+$/i

export function MicrosoftClarity({ projectId, enabled = false }: { projectId?: string; enabled?: boolean }) {
  const safeProjectId = projectId?.trim()
  if (!enabled || !safeProjectId || !projectIdPattern.test(safeProjectId)) return null

  return (
    <Script id="microsoft-clarity" strategy="lazyOnload">
      {`(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window,document,"clarity","script",${JSON.stringify(safeProjectId)});`}
    </Script>
  )
}
