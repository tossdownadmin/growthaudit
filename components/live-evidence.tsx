'use client'

import {useEffect, useState} from 'react'
import {Loader2, Globe, ExternalLink} from 'lucide-react'
import {MapMockup, SocialMockup} from './evidence-mockups'

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
  const title = kind==='map' ? 'Around your restaurant' : kind==='social' ? 'Your social presence' : 'Your mobile website'
  const source = kind==='website' ? websiteUrl : kind==='social' ? socialUrl : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(Number.isFinite(lat)&&Number.isFinite(lng)?`${lat},${lng}`:restaurant)}`
  const safeSource = /^https?:\/\//i.test(source) ? source : ''
  return <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm" aria-label={title}>
    <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</div>
    {capture.image ? <div className="h-80 overflow-x-hidden overflow-y-auto bg-white" tabIndex={0} role="region" aria-label={`${title} capture`}>
      <img src={capture.image} alt={`${title}: ${restaurant}`} className={kind==='map'?'block h-80 w-full object-cover':'block h-auto w-full'} onError={()=>setCaptures(c=>({...c,[kind]:{image:null,status:'image_failed'}}))}/>
    </div> : kind==='map' ? <MapMockup restaurant={restaurant}/> : kind==='social' ? <SocialMockup restaurant={restaurant}/> : <div className="flex min-h-80 flex-col items-center justify-center gap-4 bg-[#fbf6ee] px-6 text-center" role="status">
      {capture.status==='pending'?<Loader2 className="h-8 w-8 animate-spin text-primary"/>:<Globe className="h-8 w-8 text-primary"/>}
      <p className="font-semibold">{restaurant}</p>
      <p className="text-sm text-muted-foreground">{capture.status==='pending'?'Loading this preview…':capture.status==='missing_url'?'No public profile was provided.':'Preview unavailable. Your audit will continue using the available public information.'}</p>
      {safeSource&&<a href={safeSource} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">Visit website<ExternalLink className="h-4 w-4"/></a>}
    </div>}
    <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{capture.image?'Public page capture':kind==='map'||kind==='social'?'Illustrative preview':'Website, location and social previews are optional evidence.'}</div>
  </section>
}
