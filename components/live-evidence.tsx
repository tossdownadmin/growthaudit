'use client'

import {useEffect, useState} from 'react'
import {Globe, ExternalLink} from 'lucide-react'
import {MapMockup, SocialMockup, WebsiteLoading} from './evidence-mockups'
import {preloadWebsitePreview} from '@/lib/website-preview'

type Capture = {image:string|null; status:string}
const pending:Capture = {image:null,status:'pending'}

export function LiveEvidence({stage,restaurant,websiteUrl,socials,lat,lng}:{stage:number;restaurant:string;websiteUrl:string;socials:Record<string,string|undefined>;lat?:number;lng?:number}) {
  const [captures,setCaptures] = useState<Record<string,Capture>>({website:pending,map:pending,social:pending})
  const socialUrl = Object.values(socials).find(url=>url && /^https?:\/\//i.test(url)) || ''
  useEffect(()=>{
    const controller = new AbortController()
    setCaptures({website:pending,map:pending,social:pending})
    async function request(kind:string,url?:string) {
      if (kind !== 'map' && !url) {setCaptures(c=>({...c,[kind]:{image:null,status:'missing_url'}}));return}
      try {
        if (kind === 'website' && url) {
          let result = await preloadWebsitePreview(url)
          const retryable = ['capture_failed','request_failed','unavailable','empty_image','provider_408','provider_429','provider_500','provider_502','provider_503','provider_504'].includes(result.status)
          if (!result.image && retryable && !controller.signal.aborted) {
            await new Promise(resolve=>setTimeout(resolve,1500))
            if (controller.signal.aborted) return
            result = await preloadWebsitePreview(url)
          }
          if (!controller.signal.aborted) setCaptures(c=>({...c,website:result}))
          return
        }
        const response = await fetch('/api/evidence-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,url,lat,lng}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])})
        const result:Capture = response.ok ? await response.json() : {image:null,status:'request_failed'}
        if (!controller.signal.aborted) setCaptures(c=>({...c,[kind]:{image:result.image||null,status:result.status||'unavailable'}}))
      } catch {if (!controller.signal.aborted) setCaptures(c=>({...c,[kind]:{image:null,status:'unavailable'}}))}
    }
    void request('website',websiteUrl)
    void request('map')
    // Avoid occupying every Browserless slot while the first website is captured.
    const timer = setTimeout(()=>void request('social',socialUrl),8000)
    return ()=>{controller.abort();clearTimeout(timer)}
  },[websiteUrl,socialUrl,lat,lng])
  const kind = stage===1 ? 'map' : stage===3 ? 'social' : 'website'
  const capture = captures[kind]
  const title = kind==='map' ? 'Around your restaurant' : kind==='social' ? 'Your social presence' : 'Your website'
  const source = kind==='website' ? websiteUrl : kind==='social' ? socialUrl : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(Number.isFinite(lat)&&Number.isFinite(lng)?`${lat},${lng}`:restaurant)}`
  const safeSource = /^https?:\/\//i.test(source) ? source : ''
  return <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm" aria-label={title}>
    <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</div>
    {capture.image ? <div className="h-80 overflow-x-hidden overflow-y-auto bg-white" tabIndex={0} role="region" aria-label={`${title} capture`}>
      <img src={capture.image} alt={`${title}: ${restaurant}`} className={kind==='map'?'block h-80 w-full object-cover':'block h-auto w-full'} onError={()=>setCaptures(c=>({...c,[kind]:{image:null,status:'image_failed'}}))}/>
    </div> : kind==='map' ? <MapMockup restaurant={restaurant}/> : kind==='social' ? <SocialMockup restaurant={restaurant}/> : capture.status==='pending' ? <WebsiteLoading url={websiteUrl}/> : <div className="flex min-h-80 flex-col items-center justify-center gap-4 bg-[#fbf6ee] px-6 text-center" role="status">
      <Globe className="h-8 w-8 text-primary"/>
      <p className="font-semibold">{restaurant}</p>
      <p className="text-sm text-muted-foreground">{capture.status==='missing_url'?'No public profile was provided.':'Preview unavailable. Your audit will continue using the available public information.'}</p>
      {safeSource&&<a href={safeSource} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">Visit website<ExternalLink className="h-4 w-4"/></a>}
    </div>}
    {capture.image&&<div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Public page capture</div>}
  </section>
}
