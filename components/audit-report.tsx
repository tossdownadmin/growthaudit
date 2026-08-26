'use client'
import { useState } from 'react'
import { ArrowRight, BarChart3, Check, ExternalLink, FileSearch, Gauge, Link2, MapPin, MessageSquare, Minus, Monitor, Repeat2, Share2, ShoppingBag, Smartphone, Sparkles, Star, Store, TrendingUp, Users, X } from 'lucide-react'
import { SiInstagram, SiFacebook, SiTiktok, SiYoutube, SiX, SiThreads, SiPinterest, SiSnapchat, SiWhatsapp } from 'react-icons/si'

export const pink = '#ed1f5b'
export const PLATFORM_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', twitter: 'X / Twitter', threads: 'Threads', linkedin: 'LinkedIn', pinterest: 'Pinterest', snapchat: 'Snapchat', whatsapp: 'WhatsApp' }

// Client-facing framing: this audit inspects the restaurant's OWN stack of
// direct-to-customer channels and flags which are working. Derives an at-a-glance
// state for each channel so the client immediately understands what's analyzed.
function channelState(kind:'good'|'warn'|'bad'|'none'){const map={good:{color:'#0f9d58',dot:'bg-success',label:'Working'},warn:{color:'#f4a400',dot:'bg-warning',label:'Needs attention'},bad:{color:pink,dot:'bg-danger',label:'Leaking'},none:{color:'var(--color-muted-foreground)',dot:'bg-muted-foreground',label:'Not connected'}};return map[kind]}
function ChannelFraming({audit}:{audit:any}){
  const reviews=audit.reviews; const website=audit.website; const social=audit.social
  const m=reviews?.metrics
  // Reviews-as-a-channel: present if there's a rating; healthy only if the owner is replying.
  const reviewsKind:'good'|'warn'|'bad'|'none'=reviews?.googleRating==null?'none':(reviews.responseMeasured&&m&&m.overallResponseRate!=null?(m.overallResponseRate>=0.5?'good':m.overallResponseRate>=0.15?'warn':'bad'):'warn')
  const reviewsNote=reviews?.googleRating==null?'No public reviews found':reviews.responseMeasured&&m&&m.overallResponseRate!=null?`${Math.round(m.overallResponseRate*100)}% of recent reviews answered`:'Reviews present'
  const siteKind:'good'|'warn'|'bad'|'none'=website?.reachable===false?'bad':website?.performance==null?'warn':website.performance>=50?'good':'warn'
  const siteNote=website?.reachable===false?'Website unreachable':website?.performance!=null?`${website.performance}/100 mobile performance`:'Website reached · speed not scored'
  const measuredSocials=(social?.profiles??[]).filter((p:any)=>p.status!=='unavailable')
  const activeSocials=measuredSocials.filter((p:any)=>p.status==='active'||p.status==='inconsistent')
  const socialKind:'good'|'warn'|'bad'|'none'=!social?.configured||measuredSocials.length===0?'none':activeSocials.length===0?'bad':activeSocials.some((p:any)=>p.status==='active')?'good':'warn'
  const socialNote=!social?.configured?'Not configured':measuredSocials.length===0?'No active profiles measured':`${activeSocials.length} of ${measuredSocials.length} channels active`
  const channels:Array<{icon:React.ReactNode;name:string;kind:'good'|'warn'|'bad'|'none';note:string}>=[
    {icon:<Star className="h-4 w-4"/>,name:'Google reviews',kind:reviewsKind,note:reviewsNote},
    {icon:<Gauge className="h-4 w-4"/>,name:'Website & ordering',kind:siteKind,note:siteNote},
    {icon:<Share2 className="h-4 w-4"/>,name:'Social channels',kind:socialKind,note:socialNote},
  ]
  return <div className="border-b border-border py-8">
    <p className="max-w-3xl text-base leading-7 text-muted-foreground">This report audits <span className="font-medium text-foreground">your own stack</span> — the channels you already use to reach and keep customers. We check each one to answer a single question: <span className="font-medium text-foreground">are all your direct-to-customer channels actually working?</span></p>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">{channels.map(c=>{const st=channelState(c.kind);return <div key={c.name} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-medium">{c.icon}{c.name}</div><span className="flex items-center gap-1.5 text-xs font-medium" style={{color:st.color}}><span className={`h-2 w-2 rounded-full ${st.dot}`}/>{st.label}</span></div><p className="mt-3 text-sm text-muted-foreground">{c.note}</p></div>})}</div>
  </div>
}
// End-of-report checklist: a plain-language inventory of the direct-to-customer
// channels/signals the restaurant HAS (checked) vs is MISSING (unchecked), each
// missing item paired with a concrete suggestion. ok===null means not measured.
type ChecklistState='pass'|'attention'|'fail'|'unknown'
type ChecklistItem={label:string;state:ChecklistState;tip?:string}
function buildChecklist(audit:any):Array<{title:string;items:ChecklistItem[]}>{
  const website=audit.website??{}; const reviews=audit.reviews??{}; const social=audit.social??{}
  const meta=website.metaTags??{}; const psi=website.pageSpeed?.mobile??website.pageSpeed?.desktop; const checks=psi?.seoChecks??{}
  const htmlAvailable=website.htmlAvailable!==false
  const boolState=(value:boolean|null|undefined):ChecklistState=>value===true?'pass':value===false?'fail':'unknown'
  const metaState=(v:any,verified:any):ChecklistState=>v?'pass':verified===true?'pass':htmlAvailable?'fail':'unknown'
  const m=reviews.metrics

  // --- Profile consistency: does the business point customers to its own stack? ---
  const hostOf=(url:string):string=>{try{return new URL(/^https?:\/\//i.test(url)?url:`https://${url}`).hostname.replace(/^www\./,'').toLowerCase()}catch{return ''}}
  const NOT_A_WEBSITE=['facebook.com','fb.com','fb.me','m.facebook.com','instagram.com','instagr.am','tiktok.com','twitter.com','x.com','yelp.com','linktr.ee','linktree.com','beacons.ai','bio.link','allmylinks.com','msha.ke','tap.bio','carrd.co']
  const hostMatches=(h:string,domain:string)=>h===domain||h.endsWith('.'+domain)
  const isProperWebsite=(url:string)=>{const h=hostOf(url);return h?!NOT_A_WEBSITE.some(d=>hostMatches(h,d)):false}
  const gmbUrl:string=audit.restaurant?.googleWebsiteUrl||''
  const gmbHost=hostOf(gmbUrl)
  const independentlyVerifiedWebsite=(audit.restaurant?.brandAssets??[]).find((asset:any)=>asset.kind==='website'&&asset.verification==='verified_brand_asset_missing_from_gmb')
  const ownHost=isProperWebsite(gmbUrl)?gmbHost:hostOf(website.finalUrl||'')
  const profiles:any[]=social.profiles??[]
  const presentProfiles=profiles.filter((p:any)=>p.status&&p.status!=='unavailable')
  const withBio=presentProfiles.filter((p:any)=>p.bioLink)
  const bioLinkingOwn=ownHost?withBio.filter((p:any)=>{const h=hostOf(p.bioLink);return h&&hostMatches(h,ownHost)}):[]
  const bioLinkState:ChecklistState=!social.configured||presentProfiles.length===0||!ownHost?'unknown':bioLinkingOwn.length>0?'pass':'fail'
  const missingBioChannels=presentProfiles.filter((p:any)=>!bioLinkingOwn.includes(p)).map((p:any)=>PLATFORM_LABEL[p.platform]||p.platform)

  const gmbDays:number|null=audit.restaurant?.openingHours?.daysOpen??null
  const siteHours=website.openingHours
  const hoursState:ChecklistState=(gmbDays==null||!siteHours)?'unknown':gmbDays===siteHours.days?'pass':'fail'

  const mobilePerf =
    website?.pageSpeed?.mobile?.performance ??
    website?.performance ??
    null
  const mobileSpeedState:ChecklistState =
    mobilePerf===null||mobilePerf===undefined
      ? 'unknown'
      : Number(mobilePerf)>=75
        ? 'pass'
        : Number(mobilePerf)>=50
          ? 'attention'
          : 'fail'

  const orderingState:ChecklistState =
    website.ordering?.status==='owned'||website.ordering?.status==='branded_direct'
      ? 'pass'
      : website.ordering?.status==='mixed'||website.ordering?.status==='location_required'||website.ordering?.status==='unclear'
        ? 'attention'
        : website.ordering?.status==='marketplace'||website.ordering?.status==='none'
          ? 'fail'
          : 'unknown'

  const responseState:ChecklistState =
    !reviews.responseMeasured||!m||m.sampleSize<10||m.overallResponseRate==null
      ? 'unknown'
      : m.overallResponseRate>=0.5
        ? 'pass'
        : m.overallResponseRate>0
          ? 'attention'
          : 'fail'

  const negativeResponseState:ChecklistState =
    !reviews.responseMeasured||!m||m.sampleSize<10
      ? 'unknown'
      : m.negativeReviews===0
        ? 'pass'
        : m.negativeReviews<3||m.negativeResponseRate==null
          ? 'attention'
          : m.negativeResponseRate>=0.7
            ? 'pass'
            : m.negativeResponseRate>0
              ? 'attention'
              : 'fail'

  const socialActivityState:ChecklistState =
    !social.configured||presentProfiles.length===0
      ? 'unknown'
      : presentProfiles.some((p:any)=>p.status==='active'&&Number(p.evidenceConfidence||0)>=0.5)
        ? 'pass'
        : presentProfiles.some((p:any)=>p.status==='inconsistent'||p.status==='active')
          ? 'attention'
          : presentProfiles.some((p:any)=>p.status==='dormant')
            ? 'fail'
            : 'unknown'

  return [
    {title:'Website & online ordering',items:[
      {label:'Website is live and reachable',state:website.reachable===true?'pass':website.reachable===false?'fail':'unknown',tip:'Make sure the domain resolves and returns a working page.'},
      {label:'Served securely over HTTPS',state:boolState(website.https),tip:'Serve the whole site over HTTPS so customer data is protected.'},
      {label:'Mobile experience is fast enough to convert',state:mobileSpeedState,tip:'Mobile speed needs attention. Reduce heavy scripts and large images so customers can reach menu and ordering faster.'},
      {label:'Owned / branded ordering path',state:orderingState,tip:website.ordering?.status==='marketplace'?'Your visible order path hands the customer to a delivery marketplace. Add a branded/direct order path so more of the transaction and customer relationship stays with the restaurant.':'Strengthen the branded/direct order path from the website.'},
    ]},
    {title:'Get found on Google',items:[
      {label:'Page title set',state:metaState(meta.title,checks.documentTitle),tip:'Add a clear page title so your listing reads correctly in search results.'},
      {label:'Meta description set',state:metaState(meta.description,checks.metaDescription),tip:'Add a meta description to improve search-result click-through.'},
      {label:'Structured data (schema)',state:website.schema?'pass':htmlAvailable?'fail':'unknown',tip:'Add restaurant schema so search engines can understand hours, menu and location details.'},
      {label:'Link preview image (Open Graph)',state:meta.ogImage?'pass':htmlAvailable?'fail':'unknown',tip:'Add an Open Graph image so shared links present the brand professionally.'},
    ]},
    {title:'Profile consistency',items:[
      {label:'Google profile links to your own website',state:gmbUrl?(isProperWebsite(gmbUrl)?'pass':'fail'):'fail',tip:gmbUrl?`Your Google Business Profile points to ${gmbHost||'a third-party link'} instead of your own website. Replace it with the restaurant website so customers land on a channel you control.`:independentlyVerifiedWebsite?`We verified ${independentlyVerifiedWebsite.url} as the restaurant website, but it is missing from Google Business Profile. Add this exact website to Google so search customers reach your owned destination.`:'Add the restaurant website to Google Business Profile.'},
      {label:'Social bios route customers to your website',state:bioLinkState,tip:missingBioChannels.length?`Add your website link to ${missingBioChannels.join(', ')} so social attention can turn into direct visits and orders.`:'Point active social audiences toward your owned website or direct ordering path.'},
      {label:'Opening hours match Google & website',state:hoursState,tip:(gmbDays!=null&&siteHours)?`Google shows ${gmbDays} open day${gmbDays===1?'':'s'} while the website publishes ${siteHours.days}. Align them so customers see one source of truth.`:'Publish opening hours in structured website data so they can be verified against Google.'},
    ]},
    {title:'Reviews & reputation',items:[
      {label:'Google reputation established',state:reviews.googleRating!=null?'pass':'unknown',tip:'Build consistent Google review volume so customers have current proof before choosing where to eat.'},
      {label:'Owner replies to recent reviews',state:responseState,tip:'Respond consistently to reviews so customers see that management is listening.'},
      {label:'Negative reviews are actively recovered',state:negativeResponseState,tip:'Respond to unhappy customers quickly and provide a clear recovery path.'},
    ]},
    {title:'Social engagement',items:[
      {label:'At least one actively maintained public social channel',state:socialActivityState,tip:'Keep at least one customer-relevant social channel consistently active; you do not need to be everywhere.'},
      {label:'Social bios route customers to your website',state:bioLinkState,tip:'Point active social audiences toward your owned website or direct ordering path.'},
    ]},
  ]
}
function ChecklistRow({item}:{item:ChecklistItem}){
  const icon=
    item.state==='pass'?<Check className="h-4 w-4"/>:
    item.state==='fail'?<X className="h-4 w-4"/>:
    <Minus className="h-4 w-4"/>
  const color=
    item.state==='pass'?'#0f9d58':
    item.state==='attention'?'#f4a400':
    item.state==='fail'?pink:
    'var(--color-muted-foreground)'
  const bg=
    item.state==='pass'?'rgba(15,157,88,0.12)':
    item.state==='attention'?'rgba(244,164,0,0.12)':
    item.state==='fail'?'rgba(237,31,91,0.12)':
    'var(--color-muted)'
  const suffix=
    item.state==='attention'?'needs attention':
    null
  return <div className="flex items-start gap-3 border-b border-border py-3 last:border-0">
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{background:bg,color}}>{icon}</span>
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground">{item.label}{suffix&&<span className="ml-2 text-xs font-normal" style={{color}}>{suffix}</span>}</p>
      {(item.state==='attention'||item.state==='fail')&&item.tip&&<p className="mt-1 text-sm leading-6 text-muted-foreground">{item.tip}</p>}
    </div>
  </div>
}
function Checklist({audit}:{audit:any}){
  // Unknown/unverified items are retained internally for QA, but they do not
  // belong in the owner-facing checklist. The report should show verified
  // strengths and actionable findings, not our provider plumbing.
  const groups=buildChecklist(audit)
    .map(group=>({...group,items:group.items.filter(item=>item.state!=='unknown')}))
    .filter(group=>group.items.length>0)
  const all=groups.flatMap(g=>g.items)
  const confirmed=all.filter(i=>i.state==='pass').length
  const attention=all.filter(i=>i.state==='attention'||i.state==='fail').length
  return <section className="mt-12 rounded-3xl border border-border bg-card p-7 md:p-9">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{color:pink}}>Your direct-channel checklist</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">What&apos;s in place, and what needs attention</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">A plain-language verification of the customer-facing growth stack. Green is confirmed; amber/red marks a specific, evidence-backed opportunity.</p>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-4xl font-semibold tracking-[-0.05em]">{confirmed}<span className="text-2xl text-muted-foreground"> confirmed</span></div>
        <div className="mt-1 text-xs text-muted-foreground">{attention} need attention</div>
      </div>
    </div>
    <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2">{groups.map(g=><div key={g.title}><h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-muted-foreground">{g.title}</h3><div className="mt-2">{g.items.map(item=><ChecklistRow key={item.label} item={item}/>)}</div></div>)}</div>
  </section>
}
function growthScoreColor(score:number|null|undefined,status?:string){
  if(status==='unknown'||score===null||score===undefined)return 'var(--color-muted-foreground)'
  if(status==='good')return '#0f9d58'
  if(status==='warning')return '#f4a400'
  if(status==='bad')return pink
  if(score>=75)return '#0f9d58'
  if(score>=50)return '#f4a400'
  return pink
}

function SectionBar({section}:{section:any}){
  const score=typeof section?.score==='number'?section.score:null
  const color=growthScoreColor(score,section?.status)
  return <div className="rounded-2xl border border-border bg-card p-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-medium">{section.label}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{section.question}</p>
      </div>
      <div className="shrink-0 text-right">
        <span className="text-2xl font-semibold tracking-[-0.04em]" style={{color}}>{score===null?'—':score}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
    </div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full transition-all" style={{width:`${score??0}%`,background:color}}/>
    </div>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">{section.summary}</p>
  </div>
}

function growthIcon(key:string){
  if(key==='websiteOrdering')return <ShoppingBag className="h-4 w-4"/>
  if(key==='reputation')return <Star className="h-4 w-4"/>
  if(key==='retention')return <Repeat2 className="h-4 w-4"/>
  if(key==='engagement')return <Users className="h-4 w-4"/>
  return <BarChart3 className="h-4 w-4"/>
}

function GrowthPillars({result}:{result:any}){
  const sections=(result?.sections??[]).filter((section:any)=>section?.status!=='unknown'&&typeof section?.score==='number')
  if(!sections.length)return null
  return <section className="py-10">
    <div className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{color:pink}}>Your growth engine</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Where your growth engine is strong — and where it leaks</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">We only score areas with enough verified public evidence to support a business conclusion.</p>
    </div>
    <div className="grid gap-4 md:grid-cols-2">{sections.map((section:any)=><SectionBar key={section.key} section={section}/>)}</div>
  </section>
}

function orderingStatusLabel(status:string|undefined){
  if(status==='owned')return {label:'Owned ordering',color:'#0f9d58'}
  if(status==='branded_direct')return {label:'Branded direct ordering',color:'#0f9d58'}
  if(status==='mixed')return {label:'Mixed ordering',color:'#f4a400'}
  if(status==='marketplace')return {label:'Marketplace handoff',color:pink}
  if(status==='location_required')return {label:'Ordering available — location selection required',color:'#f4a400'}
  if(status==='unclear')return {label:'Ordering ownership unclear',color:'#f4a400'}
  return {label:'No online ordering detected',color:pink}
}

function WebsiteOrderingGrowth({audit}:{audit:any}){
  const ordering=audit.website?.ordering
  const section=audit.result?.sectionByKey?.websiteOrdering??audit.result?.sections?.find((s:any)=>s.key==='websiteOrdering')
  const status=orderingStatusLabel(ordering?.status)
  const paths=audit.website?.customerPaths??{}
  const pathRows=[
    ['Menu',paths.menu],
    ['Reservations',paths.reservation],
    ['Direct contact',paths.directContact],
    ['Loyalty / rewards',paths.loyalty],
    ['Customer account',paths.account],
    ['Email capture',paths.emailCapture],
    ['SMS / WhatsApp',paths.smsCapture||paths.whatsapp],
  ]
  return <section className="mb-10">
    <div className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{color:pink}}>Website + ordering</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Can a hungry customer become your customer?</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">A restaurant can have a beautiful website and still leak the relationship at checkout. We check where the order goes and what repeat-customer paths are visible around it.</p>
    </div>
    <div className="grid gap-4 md:grid-cols-[1.15fr_.85fr]">
      <div className="rounded-3xl border border-border bg-card p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Ordering relationship</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{status.label}</p>
          </div>
          <span className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{color:status.color,background:`color-mix(in srgb, ${status.color} 12%, transparent)`}}>{section?.score??'—'}/100 pillar</span>
        </div>
        <p className="mt-4 text-base leading-7 text-muted-foreground">{ordering?.summary??'Ordering could not be measured from the public website.'}</p>
        {ordering?.status==='location_required'&&<p className="mt-3 text-sm leading-6 text-muted-foreground">Checkout, customer capture and ordering ownership were not scored because the site requires a location choice before those steps become publicly visible.</p>}
        {ordering?.primaryUrl&&<a href={ordering.primaryUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-medium hover:underline" style={{color:pink}}>Open detected order path <ExternalLink className="h-3.5 w-3.5"/></a>}
        {ordering?.links?.length>1&&<p className="mt-3 text-xs text-muted-foreground">{ordering.links.length} ordering-related links detected on the site.</p>}
      </div>
      <div className="rounded-3xl border border-border bg-card p-6">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Customer paths visible</p>
        <div className="mt-4 grid gap-2">
          {pathRows.map(([label,ok])=><div key={String(label)} className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0"><span className="text-sm text-muted-foreground">{label}</span><span className="text-sm font-medium" style={{color:ok?'#0f9d58':'var(--color-muted-foreground)'}}>{ok?'Detected':'Not detected'}</span></div>)}
        </div>
      </div>
    </div>
  </section>
}

function CompetitorBenchmarkPanel({audit}:{audit:any}){
  const b=audit.benchmark
  // Tiered rendering:
  //   • strong V3 set        → "Likely competitors" (full substitution framing)
  //   • modest V3 / fallback → "Local reference points" (directional context)
  //   • no valid set         → hide the section rather than show a placeholder.
  if(!b) return null

  const hasCandidates=Array.isArray(b.candidates)&&b.candidates.length>0
  const fromEngine=b.source==='universal_v3'
  // "Strong" keeps the original bar, but a real engine set no longer has to clear
  // it to appear — it just changes how confidently we frame it.
  const strong=fromEngine&&b.presentationEligible===true&&hasCandidates

  if(!hasCandidates)return null

  const targetRating=audit.reviews?.googleRating??audit.restaurant?.rating
  const targetReviews=audit.reviews?.googleReviewCount??audit.restaurant?.reviewCount
  const realEngine=strong
  const heading=realEngine
    ? 'A benchmark against the restaurants most likely to compete for the same customer'
    : 'Local reference points customers may consider'
  const description=realEngine
    ? 'The comparison set comes from the same substitution engine used in our dedicated competitor analysis: product/craving fit, occasion, geography, price, service format and market strength all contribute to who belongs here.'
    : 'These are nearby restaurants that share some of the same customer occasion. They are shown as directional local context; the highest-confidence substitution matches are surfaced with fuller detail when the competitor model is certain.'

  return <section className="mb-10">
    <div className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{color:pink}}>How you stack up locally</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{heading}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      {b.confidence&&<p className="mt-2 text-xs text-muted-foreground">Competitor-set confidence: <span className="font-medium capitalize text-foreground">{b.confidence}</span></p>}
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      <Metric icon={<Star className="h-4 w-4"/>} label="Google rating" value={targetRating!=null?String(targetRating):'—'} detail={b.summary?.medianRating!=null?`Competitor median: ${b.summary.medianRating}`:'Rating benchmark based on verified public profiles'}/>
      <Metric icon={<MessageSquare className="h-4 w-4"/>} label="Review proof" value={targetReviews!=null?Number(targetReviews).toLocaleString():'—'} detail={b.summary?.medianReviewCount!=null?`Competitor median: ${Math.round(b.summary.medianReviewCount).toLocaleString()}`:'Review-volume benchmark based on verified public profiles'}/>
      <Metric icon={<ShoppingBag className="h-4 w-4"/>} label="Direct ordering" value={b.summary?.orderingMeasuredCount?`${b.summary.directOrderingCount??0}/${b.summary.orderingMeasuredCount}`:'—'} detail={b.summary?.orderingMeasuredCount?`${b.summary.orderingMeasuredCount} competitor site${b.summary.orderingMeasuredCount===1?'':'s'} verified for ordering ownership`:'Ordering comparison omitted until independently verified'}/>
    </div>

    <div className="mt-4 overflow-hidden rounded-3xl border border-border bg-card">
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border px-5 py-3 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground"><span>{realEngine?'Likely competitor':'Local reference'}</span><span>Rating</span><span>Reviews</span></div>
      {b.candidates.slice(0,5).map((c:any)=><div key={c.placeId} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-5 py-4 last:border-0">
        <div className="min-w-0">
          <p className="truncate font-medium">{c.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {c.distanceMi!=null?`${c.distanceMi} mi away`:''}
            {realEngine&&c.classification?`${c.distanceMi!=null?' · ':''}${c.classification}`:''}
            {realEngine&&typeof c.fitScore==='number'?` · ${c.fitScore}/100 substitution fit`:''}
            {c.ordering?.status==='owned'||c.ordering?.status==='branded_direct'?' · direct ordering':
             c.ordering?.status==='marketplace'?' · marketplace handoff':''}
          </p>
        </div>
        <span className="text-sm font-medium">{c.rating??'—'}</span>
        <span className="text-sm text-muted-foreground">{c.reviewCount!=null?Number(c.reviewCount).toLocaleString():'—'}</span>
      </div>)}
    </div>
  </section>
}

function LocalSearchVisibility({insight}:{insight:any}){
  if(!insight||insight.status==='unavailable'||!insight.keywords?.length)return null
  return <section className="mb-10">
    <div className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{color:pink}}>Local search visibility</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Your Top 5 tracked local searches</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Observed from one location-aware Google check per query. A blank position means your confirmed website or Google Business Profile was not observed in that result set.</p>
    </div>
    <div className="rounded-3xl border border-border bg-card p-7">
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border pb-3 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground"><span>Tracked query</span><span>Organic</span><span>Google local</span></div>
      {insight.keywords.map((row:any,index:number)=><div key={row.query} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-border py-4 last:border-0"><div className="min-w-0"><span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">{index+1}</span><span className="text-sm font-medium">{row.query}</span></div><span className="text-sm font-semibold">{row.organicPosition!=null?`#${row.organicPosition}`:'—'}</span><span className="text-sm font-semibold">{row.localPosition!=null?`#${row.localPosition}`:'—'}</span></div>)}
    </div>
  </section>
}
function priorityText(p:any){
  if(typeof p==='string')return p
  return p?.title||p?.action||p?.whyItMatters||p?.summary||''
}

function GrowthLeaks({interpretation}:{interpretation:any}){
  const priorities=(interpretation?.priorities??[]).map(priorityText).filter(Boolean).slice(0,3)
  return <section className="mb-10 grid gap-5 md:grid-cols-[1.2fr_.8fr]">
    <div className="rounded-3xl bg-foreground p-7 text-background md:p-9">
      <div className="flex items-center gap-2 text-sm" style={{color:'#f98aa7'}}><Sparkles className="h-4 w-4"/>Growth intelligence</div>
      <p className="mt-6 text-2xl font-medium leading-tight tracking-[-0.035em]">{interpretation?.executiveSummary}</p>
      <div className="mt-8 border-t border-white/15 pt-6">
        <p className="text-xs uppercase tracking-[0.16em] text-white/50">Biggest growth leak</p>
        <p className="mt-3 text-lg leading-7">{interpretation?.primaryLeak}</p>
      </div>
    </div>
    <div className="rounded-3xl border border-border bg-card p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{color:pink}}>Your 3 priorities</p>
      <div className="mt-4 grid gap-4">{priorities.map((p:string,n:number)=><div key={`${n}-${p}`} className="flex gap-3 border-t border-border pt-4 first:border-0 first:pt-0"><span className="font-mono text-xs" style={{color:pink}}>0{n+1}</span><p className="text-sm font-medium leading-6">{p}</p></div>)}</div>
    </div>
  </section>
}

function PaidMediaReadiness({result,interpretation}:{result:any;interpretation:any}){
  const r=result?.paidMediaReadiness
  if(!r)return null
  const map:any={
    ready:{label:'Ready to scale traffic',color:'#0f9d58',icon:<TrendingUp className="h-5 w-5"/>},
    almost_ready:{label:'Almost ready to scale',color:'#f4a400',icon:<TrendingUp className="h-5 w-5"/>},
    fix_engine_first:{label:'Fix the engine first',color:pink,icon:<Store className="h-5 w-5"/>},
  }
  const state=map[r.status]??map.fix_engine_first
  return <section className="mb-10 rounded-3xl border border-border bg-card p-7 md:p-9">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-sm font-semibold" style={{color:state.color}}>{state.icon}{state.label}</div>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">Paid media should be fuel — not a patch for a broken customer journey.</h2>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">{interpretation?.paidMediaReadinessSummary||r.summary}</p>
      </div>
    </div>
  </section>
}

function GrowthEngineMap({audit}:{audit:any}){
  const sections=audit.result?.sectionByKey??{}
  const rows=[
    {label:'Website + Ordering',sub:'Turn high-intent traffic into a direct action.',key:'websiteOrdering'},
    {label:'Reputation & Reviews',sub:'Win trust when diners compare nearby options.',key:'reputation'},
    {label:'Getting Customers Back',sub:'Create visible paths to recognize and reach customers again.',key:'retention'},
    {label:'Staying Connected',sub:'Stay active across social and customer feedback.',key:'engagement'},
    {label:'Knowing What Works',sub:'Know what is working before you scale it.',key:'measurement'},
  ]
  return <section className="mb-10">
    <div className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{color:pink}}>What a complete engine looks like</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">One connected system, not five disconnected tools</h2>
    </div>
    <div className="overflow-hidden rounded-3xl border border-border bg-card">
      {rows.map(row=>{const section=sections[row.key]??audit.result?.sections?.find((s:any)=>s.key===row.key);if(!section||section.status==='unknown'||typeof section.score!=='number')return null;const score=section.score;const color=growthScoreColor(score,section?.status);return <div key={row.key} className="grid gap-3 border-b border-border p-5 last:border-0 md:grid-cols-[1fr_100px] md:items-center"><div><div className="flex items-center gap-2 font-medium">{growthIcon(row.key)}{row.label}</div><p className="mt-1 text-sm text-muted-foreground">{row.sub}</p></div><div className="text-left md:text-right"><span className="text-2xl font-semibold" style={{color}}>{score}</span><span className="text-xs text-muted-foreground">/100</span></div></div>})}
    </div>
    <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-3xl px-7 py-6 text-white shadow-xl md:flex-row md:items-center" style={{background:'linear-gradient(115deg, #ed1f5b, #bf1648 58%, #6d1a66)'}}>
      <div><p className="text-sm font-semibold">Close the leaks before buying more traffic.</p><p className="mt-1 text-sm text-white/80">tossdown connects the website, direct ordering, customer relationship, reputation and growth stack.</p><a href="mailto:info@tossdown.com" className="mt-2 inline-block text-xs font-medium text-white/80 underline-offset-4 hover:text-white hover:underline">info@tossdown.com</a></div>
      <a href="https://tossdown.com" target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black shadow-lg hover:-translate-y-0.5">Talk to tossdown <ArrowRight className="h-4 w-4"/></a>
    </div>
  </section>
}

function OwnerReportMap(){
  const stops=[
    {href:'#engine',label:'Growth engine',detail:'Where demand leaks',icon:<Gauge className="h-4 w-4"/>},
    {href:'#market',label:'Local search',detail:'How Google describes you',icon:<MapPin className="h-4 w-4"/>},
    {href:'#voice',label:'Customer voice',detail:'What guests repeat',icon:<MessageSquare className="h-4 w-4"/>},
    {href:'#evidence',label:'Technical proof',detail:'What supports the score',icon:<FileSearch className="h-4 w-4"/>},
  ]
  return <nav aria-label="Report sections" className="my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{stops.map((stop,index)=><a key={stop.href} href={stop.href} className="surface-card group rounded-2xl bg-card p-4 hover:-translate-y-0.5 hover:border-primary"><div className="flex items-center justify-between"><span className="font-mono text-xs" style={{color:pink}}>0{index+1}</span><span className="text-muted-foreground group-hover:text-primary">{stop.icon}</span></div><p className="mt-4 text-sm font-semibold">{stop.label}</p><p className="mt-1 text-xs text-muted-foreground">{stop.detail}</p></a>)}</nav>
}

export function Report({audit,onReset}:{audit:any;onReset:()=>void}){
  const r=audit.result
  const i=audit.interpretation
  return <main className="min-h-screen">
    <header className="brand-header mx-auto flex max-w-6xl items-center justify-between px-6 py-7"><div className="text-xl font-semibold tracking-[-0.04em]">tossdown<span style={{color:pink}}>.</span></div><button onClick={onReset} className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm hover:text-foreground">New audit</button></header>
    <section className="mx-auto max-w-6xl px-6 pb-24 pt-10">
      <div className="report-hero flex flex-col justify-between gap-8 p-7 md:flex-row md:items-end md:p-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{color:pink}}>Restaurant growth audit</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em] md:text-6xl">{audit.restaurant.name}</h1>
          <p className="mt-3 flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" style={{color:pink}}/>{audit.restaurant.address}</p>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">How well your restaurant turns attention into direct orders, repeat customers, active relationships, and measurable growth.</p>
        </div>
        <div className="flex items-end gap-4">
          <div className="rounded-3xl bg-foreground px-6 py-5 text-white shadow-2xl"><div className="text-7xl font-semibold leading-none tracking-[-0.08em]">{r.score}</div><div className="mt-2 text-sm text-white/65">Growth Engine Score · out of 100</div></div>
        </div>
      </div>
      <OwnerReportMap/>
      <div id="engine"><GrowthPillars result={r}/><GrowthLeaks interpretation={i}/><WebsiteOrderingGrowth audit={audit}/></div>
      <div id="market"><LocalSearchVisibility insight={audit.localSearch}/></div>
      <div id="voice"><ReviewsPanel reviews={audit.reviews} interpretation={i}/><SocialActivity social={audit.social}/></div>
      <GrowthEngineMap audit={audit}/>

      <div id="evidence" className="border-t border-border pt-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{color:pink}}>Supporting technical evidence</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">The details behind the score</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">These checks explain the diagnosis. They matter, but they are intentionally secondary to the restaurant-owner questions above.</p>
      </div>
      <div className="mt-8"><PageSpeedPanel website={audit.website}/></div>
      <WebsiteIntelligence website={audit.website}/>
      <Checklist audit={audit}/>
    </section>
  </main>
}
const SOCIAL_STATUS:Record<string,{label:string;color:string;dot:string}>={active:{label:'Active',color:'#0f9d58',dot:'bg-success'},inconsistent:{label:'Inconsistent',color:'#f4a400',dot:'bg-warning'},dormant:{label:'Dormant',color:pink,dot:'bg-danger'},insufficient_data:{label:'Limited public sample',color:'var(--color-muted-foreground)',dot:'bg-muted-foreground'},unavailable:{label:'Profile found',color:'var(--color-muted-foreground)',dot:'bg-muted-foreground'}}
const SOCIAL_BRAND:Record<string,{Icon:React.ComponentType<{className?:string;style?:React.CSSProperties}>;color:string}>={instagram:{Icon:SiInstagram,color:'#E4405F'},facebook:{Icon:SiFacebook,color:'#1877F2'},tiktok:{Icon:SiTiktok,color:'currentColor'},youtube:{Icon:SiYoutube,color:'#FF0000'},twitter:{Icon:SiX,color:'currentColor'},threads:{Icon:SiThreads,color:'currentColor'},pinterest:{Icon:SiPinterest,color:'#BD081C'},snapchat:{Icon:SiSnapchat,color:'#111111'},whatsapp:{Icon:SiWhatsapp,color:'#25D366'}}
function socialIcon(platform:string){const cls='h-4 w-4 shrink-0';const brand=SOCIAL_BRAND[platform];if(brand){const {Icon,color}=brand;return <Icon className={cls} style={color==='currentColor'?undefined:{color}}/>}return <Share2 className={cls}/>}
function daysAgo(days:number|null){if(days===null)return '—';if(days<=0)return 'Today';if(days===1)return 'Yesterday';if(days<30)return `${days} days ago`;if(days<365)return `${Math.round(days/30)} mo ago`;return `${Math.round(days/365*10)/10} yr ago`}
function fmtNum(v:number|null){return v===null?'—':v.toLocaleString()}
function freqLabel(perWeek:number|null){if(perWeek===null||perWeek<=0)return '—';if(perWeek>=7)return `${Math.round(perWeek/7*10)/10}/day`;if(perWeek>=1)return `${Math.round(perWeek*10)/10}/week`;return `${Math.round(perWeek*4.3*10)/10}/month`}
function SocialCard({p}:{p:any}){
  const s=SOCIAL_STATUS[p.status]??SOCIAL_STATUS.unavailable
  const confidence=Number(p.evidenceConfidence||0)
  const computedFreq=typeof p.postsPerWeek==='number'&&p.postsPerWeek<=14?p.postsPerWeek:null
  const providerFreq=typeof p.providerCadence==='number'&&p.providerCadence<=14?p.providerCadence:null
  const safeFreq=(p.postsAnalyzed??0)>=4&&confidence>=0.55?(computedFreq??providerFreq):null
  const candidateEngagement=(p.postsAnalyzed??0)>=10&&(p.followers??0)>=300&&confidence>=0.65?p.averageEngagementRate:null
  const safeEngagement=typeof candidateEngagement==='number'&&candidateEngagement<=10?candidateEngagement:null
  const rows:Array<[string,string]>=[
    ['Followers',fmtNum(p.followers)],
    ['Last observed post',daysAgo(p.daysSinceLastPost)],
    ...(safeFreq!==null?[['Posting frequency',freqLabel(safeFreq)] as [string,string]]:[]),
    ...(safeEngagement!==null?[['Engagement rate',`${safeEngagement}%`] as [string,string]]:[]),
  ]
  return <div className="rounded-2xl border border-border bg-card p-6">
    <div className="flex items-center justify-between gap-3">
      <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 font-medium hover:underline">{socialIcon(p.platform)}{PLATFORM_LABEL[p.platform]??p.platform}<ExternalLink className="h-3 w-3 text-muted-foreground"/></a>
      <span className="flex items-center gap-1.5 text-sm font-medium" style={{color:s.color}}><span className={`h-2 w-2 rounded-full ${s.dot}`}/>{s.label}</span>
    </div>
    {p.status==='unavailable'
      ? <p className="mt-4 text-sm leading-6 text-muted-foreground">The public profile is confirmed. We only publish activity metrics when the post sample is strong enough to support them.</p>
      : <div className="mt-5 grid gap-2 text-sm">
          {rows.map(([label,value])=><div key={label} className="flex items-center justify-between gap-4 border-b border-border pb-2 last:border-0"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>)}
          {p.postsAnalyzed>0&&<div className="flex items-center justify-between gap-4 pt-1 text-xs text-muted-foreground"><span>Public posts analyzed</span><span>{p.postsAnalyzed}</span></div>}
        </div>}
  </div>
}
function SocialActivity({social}:{social:any}){
  if(!social)return null
  const profiles=social.profiles??[]
  const reliable=profiles.filter((p:any)=>p.status!=='unavailable'&&Number(p.evidenceConfidence||0)>=0.45&&p.postsAnalyzed>=4)
  const searchDiscovered=(social.brandAssets??[]).filter((asset:any)=>asset.kind==='social'&&asset.source==='search'&&asset.verification==='verified_brand_asset')
  const officialProfiles=Object.entries(social.discovered??{}).filter(([,url])=>typeof url==='string'&&url) as Array<[string,string]>
  if(!reliable.length&&!searchDiscovered.length&&!officialProfiles.length)return null
  const summary='Activity is shown only where the public post sample is strong enough to support a real recency or posting-frequency conclusion.'
  const rendered=reliable
  return <section className="mb-10">
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{color:pink}}>Social activity &amp; engagement</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Is this an active customer relationship channel?</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{summary}</p>
    </div>
    {searchDiscovered.length>0&&<div className="mb-4 rounded-2xl border border-warning/40 bg-warning/10 p-5 text-sm"><p className="font-semibold text-foreground">Official social profile found — missing from the restaurant website</p><p className="mt-2 leading-6 text-muted-foreground">We verified {searchDiscovered.map((asset:any)=>PLATFORM_LABEL[asset.platform]||asset.platform).join(', ')} through a platform-specific brand search. Add {searchDiscovered.length===1?'this profile':'these profiles'} to the official website so customers can verify the connection and move between channels.</p></div>}
    {officialProfiles.length>0&&<div className="mb-4 rounded-2xl border border-border bg-card p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Official profiles found</p><div className="mt-3 flex flex-wrap gap-2">{officialProfiles.map(([platform,url])=><a key={platform} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm font-medium hover:border-primary hover:text-primary">{socialIcon(platform)}{PLATFORM_LABEL[platform]||platform}<ExternalLink className="h-3.5 w-3.5"/></a>)}</div><p className="mt-3 text-xs leading-5 text-muted-foreground">Profile presence is confirmed separately from activity measurement, so a provider data gap does not hide an official channel.</p></div>}
    {rendered.length>0&&<div className="grid gap-4 md:grid-cols-2">{rendered.map((p:any)=><SocialCard key={`${p.platform}-${p.url}`} p={p}/>)}</div>}
  </section>
}
function scoreColor(v:number|null|undefined){if(v===null||v===undefined)return 'var(--color-muted-foreground)';if(v>=90)return '#0f9d58';if(v>=50)return '#f4a400';return pink}
function ScoreRing({value,label}:{value:number|null|undefined;label:string}){const pct=value??0;const color=scoreColor(value);return <div className="flex flex-col items-center gap-2"><div className="relative flex h-20 w-20 items-center justify-center rounded-full" style={{background:`conic-gradient(${color} ${pct*3.6}deg, var(--color-muted) 0deg)`}}><div className="flex h-15 w-15 items-center justify-center rounded-full bg-card" style={{height:'3.75rem',width:'3.75rem'}}><span className="text-lg font-semibold" style={{color}}>{value===null||value===undefined?'—':value}</span></div></div><span className="text-xs text-muted-foreground">{label}</span></div>}
function DeviceCard({icon,title,run}:{icon:React.ReactNode;title:string;run:any}){if(!run)return null;const m=run.metrics??{};const field=run.fieldData?String(run.fieldData).replace('_',' ').toLowerCase():null;return <div className="rounded-2xl border border-border bg-card p-6"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-medium">{icon}{title}</div>{field&&<span className="rounded-full bg-muted px-3 py-1 text-xs capitalize">Field: {field}</span>}</div><div className="mt-5 grid grid-cols-4 gap-2"><ScoreRing value={run.performance} label="Perf"/><ScoreRing value={run.accessibility} label="A11y"/><ScoreRing value={run.bestPractices} label="Best"/><ScoreRing value={run.seo} label="SEO"/></div><div className="mt-6 grid gap-2 text-sm">{[['Largest Contentful Paint',m.lcp?.display],['First Contentful Paint',m.fcp?.display],['Total Blocking Time',m.tbt?.display],['Cumulative Layout Shift',m.cls?.display],['Speed Index',m.speedIndex?.display],['Time to Interactive',m.tti?.display]].map(([label,value])=><div key={String(label)} className="flex items-center justify-between gap-4 border-b border-border pb-2 last:border-0"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value||'—'}</span></div>)}</div>{run.opportunities?.length>0&&<div className="mt-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Top opportunities</p><ul className="mt-2 grid gap-1 text-sm">{run.opportunities.map((o:string)=><li key={o} className="text-muted-foreground">• {o}</li>)}</ul></div>}</div>}
function PageSpeedPanel({website}:{website:any}){const ps=website?.pageSpeed;if(!ps||(!ps.mobile&&!ps.desktop))return null;return <section className="mb-10"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{color:pink}}>Google PageSpeed Insights</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Mobile vs desktop performance</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Real Lighthouse scores and Core Web Vitals measured by Google&apos;s headless Chrome, including field data from real Chrome users when available.</p></div></div>{ps.mobile&&ps.desktop
  ? <div className="grid items-start gap-4 md:grid-cols-2"><DeviceCard icon={<Smartphone className="h-4 w-4"/>} title="Mobile" run={ps.mobile}/><DeviceCard icon={<Monitor className="h-4 w-4"/>} title="Desktop" run={ps.desktop}/></div>
  : <div className="grid gap-4">{ps.mobile&&<DeviceCard icon={<Smartphone className="h-4 w-4"/>} title="Mobile" run={ps.mobile}/>}{ps.desktop&&<DeviceCard icon={<Monitor className="h-4 w-4"/>} title="Desktop" run={ps.desktop}/>}</div>}
</section>}
function WebsiteIntelligence({website}:{website:any}){
  const meta=website?.metaTags??{}
  // Resolve the OG image to an absolute URL so it renders even when the tag holds a relative path.
  const ogImageSrc=(()=>{if(!meta.ogImage)return null;try{return new URL(meta.ogImage,website?.finalUrl||undefined).toString()}catch{return /^https?:\/\//i.test(meta.ogImage)?meta.ogImage:null}})()
  const signals=website?.performanceSignals??{}
  const resources=website?.resources??{}
  const links=website?.links??{}
  const htmlAvailable=website?.htmlAvailable!==false
  const psi=website?.pageSpeed?.mobile??website?.pageSpeed?.desktop
  const checks=psi?.seoChecks??{}

  const metadataValue=(value:any, verified:boolean|null|undefined)=>{
    if(value)return value
    if(!htmlAvailable&&verified===true)return 'Present'
    return null
  }

  const titleState=meta.title||checks.documentTitle===true?'Title':''
  const descriptionState=meta.description||checks.metaDescription===true?'Description':''
  const schemaState=website?.schema?'Schema':''

  return <section className="mb-10 grid gap-4">
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{color:pink}}>Website intelligence</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Page speed and search readiness</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Verified website, Lighthouse, metadata, resource, and server-response signals.
        </p>
        {website?.htmlSource==='browserless'&&<p className="mt-2 text-xs text-muted-foreground">Rendered HTML fallback used.</p>}
      </div>
      <div className="text-right text-sm text-muted-foreground">
        {website?.responseMs?`${website.responseMs} ms server response`: website?.statusCode?`HTTP ${website.statusCode}` :'—'}
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      <Metric
        icon={<Gauge className="h-4 w-4"/>}
        label="Performance signal"
        value={website?.performance===null||website?.performance===undefined?'—':`${website.performance}/100`}
        detail={[
          typeof signals.htmlBytes==='number'&&signals.htmlBytes>0?`${Math.round(signals.htmlBytes/1024)} KB HTML`:null,
          typeof signals.renderBlockingScripts==='number'?`${signals.renderBlockingScripts} blocking scripts`:null,
        ].filter(Boolean).join(' · ')||'Measured by Google Lighthouse'}
      />
      <Metric
        icon={<FileSearch className="h-4 w-4"/>}
        label="SEO signal"
        value={website?.seo===null||website?.seo===undefined?'—':`${website.seo}/100`}
        detail={[titleState,descriptionState,schemaState].filter(Boolean).join(' · ')||'Search readiness measured by Google Lighthouse'}
      />
      <Metric
        icon={<Link2 className="h-4 w-4"/>}
        label="Page footprint"
        value={typeof resources.scripts==='number'?`${resources.scripts} scripts`:'Measured'}
        detail={htmlAvailable
          ? `${resources.images??0} images · ${links.internal??0} internal links · ${signals.thirdPartyHosts?.length??0} third-party hosts`
          : 'Google Lighthouse confirmed the live page'}
      />
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="font-medium">Meta tags</h3>
        <div className="mt-4 grid gap-3 text-sm">
          {[
            ['Title',metadataValue(meta.title,checks.documentTitle)],
            ['Description',metadataValue(meta.description,checks.metaDescription)],
            ['Canonical',metadataValue(meta.canonical,null)],
            ['Open Graph title',metadataValue(meta.ogTitle,null)],
          ].filter(([,value])=>Boolean(value)).map(([label,value])=>
            <div key={String(label)} className="grid gap-1 border-b border-border pb-2 last:border-0">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-foreground">{value}</span>
            </div>
          )}
          {ogImageSrc&&<div className="grid gap-2">
            <span className="text-xs text-muted-foreground">Link preview image (Open Graph)</span>
            <OgImagePreview src={ogImageSrc}/>
          </div>}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="font-medium">Speed signals</h3>
        <div className="mt-4 grid gap-3 text-sm">
          {[
            ['HTTPS',website?.https===true?'Pass':website?.https===false?'Needs attention':null],
            ['Viewport',signals.hasViewport===true?'Pass':signals.hasViewport===false?'Needs attention':null],
            ['Lazy-loaded images',typeof signals.lazyImages==='number'?`${signals.lazyImages} detected`:null],
            ['Modern image formats',typeof signals.modernImageFormats==='number'?`${signals.modernImageFormats} detected`:null],
            ['Render-blocking CSS',typeof signals.renderBlockingStyles==='number'?`${signals.renderBlockingStyles} stylesheets`:null],
            ['Third-party hosts',htmlAvailable?((signals.thirdPartyHosts??[]).join(', ')||'None detected'):null],
          ].filter(([,value])=>value!==null).map(([label,value])=>
            <div key={String(label)} className="flex items-center justify-between gap-4 border-b border-border pb-2 last:border-0">
              <span className="text-muted-foreground">{label}</span>
              <span className="text-right font-medium">{value}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  </section>
}
function OgImagePreview({src}:{src:string}){const [failed,setFailed]=useState(false);if(failed)return <span className="text-muted-foreground">Open Graph image configured</span>;return <div className="overflow-hidden rounded-xl border border-border bg-muted"><img src={src||"/placeholder.svg"} alt="Open Graph link preview image" loading="lazy" className="aspect-[1200/630] w-full object-cover" onError={()=>setFailed(true)}/></div>}
function pct(v:number|null|undefined){return v===null||v===undefined?null:`${Math.round(v*100)}%`}
function StarRow({rating}:{rating:number}){return <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>{[1,2,3,4,5].map(n=><Star key={n} className="h-5 w-5" style={{color:'#f4a400',fill:n<=Math.round(rating)?'#f4a400':'transparent'}}/>)}</div>}
function SentimentBar({pos,neu,neg}:{pos:number;neu:number;neg:number}){const total=pos+neu+neg||1;const seg=[{n:pos,c:'#0f9d58',l:'Positive'},{n:neu,c:'#f4a400',l:'Neutral'},{n:neg,c:pink,l:'Negative'}];return <div><div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">{seg.map(s=>s.n>0&&<div key={s.l} style={{width:`${s.n/total*100}%`,background:s.c}} title={`${s.l}: ${s.n} (${Math.round(s.n/total*100)}%)`}/>)}</div><div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">{seg.map(s=><div key={s.l} className="flex items-baseline gap-2"><span className="h-2.5 w-2.5 self-center rounded-full" style={{background:s.c}}/><span className="text-muted-foreground">{s.l}</span><span className="font-semibold">{s.n}</span><span className="text-xs text-muted-foreground">({Math.round(s.n/total*100)}%)</span></div>)}</div><p className="mt-3 text-xs text-muted-foreground">Based on {total} recent review{total===1?'':'s'} analyzed.</p></div>}
function ReviewsPanel({reviews,interpretation}:{reviews:any;interpretation:any}){
  if(!reviews)return null
  const m=reviews.metrics
  const hasGoogleFacts=reviews.googleRating!==null&&reviews.googleRating!==undefined
  if(!m&&!hasGoogleFacts)return null

  const sampleSize=Number(m?.sampleSize||0)
  const deepSample=reviews.source!=='google_places'&&sampleSize>=10
  const responseKnown=Boolean(reviews.responseMeasured&&deepSample&&m&&m.overallResponseRate!==null)
  const hasSentiment=Boolean(deepSample&&m&&m.positiveRate!==null)
  const signal=interpretation?.reviewRelationshipSummary
  const topics=Array.isArray(reviews.topics)?reviews.topics:[]
  const hasTopicMap=reviews.source==='outscraper'&&sampleSize>=5&&topics.length>0

  return <section className="mb-10">
    <div className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{color:pink}}>Google reviews &amp; customer sentiment</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Are customers happy — and is management listening?</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        The Google rating and review volume show the public reputation baseline. Recent sentiment and management-response metrics appear only when the public sample is large enough to support them.
      </p>
    </div>

    <div className={`grid gap-4 ${hasSentiment?'md:grid-cols-[0.9fr_1.1fr]':'md:grid-cols-2'}`}>
      <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Overall Google rating</p>
          <div className="mt-3 flex items-end gap-3">
            <span className="text-6xl font-semibold leading-none tracking-[-0.06em]">{hasGoogleFacts?reviews.googleRating:'—'}</span>
            <span className="mb-1 text-sm text-muted-foreground">/ 5</span>
          </div>
          {hasGoogleFacts&&<div className="mt-3"><StarRow rating={Number(reviews.googleRating)}/></div>}
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          {reviews.googleReviewCount!=null?`${Number(reviews.googleReviewCount).toLocaleString()} total Google reviews`:'Google review count not published'}
          {deepSample?` · ${sampleSize} recent reviews analyzed`:''}
        </p>
      </div>

      {hasSentiment
        ? <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Recent review sentiment</p>
            <div className="mt-6">
              <SentimentBar
                pos={m.positiveReviews??Math.round((m.positiveRate||0)*(m.sampleSize||0))}
                neu={m.neutralReviews??Math.round((m.neutralRate||0)*(m.sampleSize||0))}
                neg={m.negativeReviews??Math.round((m.negativeRate||0)*(m.sampleSize||0))}
              />
            </div>
          </div>
        : <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Reputation signal</p>
            <p className="mt-4 text-xl font-semibold tracking-[-0.03em]">
              {hasGoogleFacts&&Number(reviews.googleRating)>=4.5?'Strong public rating':
               hasGoogleFacts&&Number(reviews.googleRating)>=4.0?'Credible public rating':
               hasGoogleFacts?'Reputation needs attention':'Public reputation baseline'}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              We use the full Google rating and review count as the baseline and avoid turning a tiny relevance-selected snippet sample into a precise sentiment percentage.
            </p>
          </div>}
    </div>

    {responseKnown&&<div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Owner response rate</p>
        <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]" style={{color:m.overallResponseRate>=0.5?'#0f9d58':m.overallResponseRate>=0.15?'#f4a400':pink}}>{pct(m.overallResponseRate)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{m.answeredReviews??0} of {m.sampleSize} recent reviews answered</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Negative reviews answered</p>
        <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]" style={{color:m.negativeReviews===0?'#0f9d58':m.negativeReviews<3?'#f4a400':m.negativeResponseRate>=0.7?'#0f9d58':m.negativeResponseRate>=0.35?'#f4a400':pink}}>
          {m.negativeReviews===0?'No recent negatives':m.negativeReviews<3?'Small negative sample':m.negativeResponseRate!==null?pct(m.negativeResponseRate):'—'}
        </p>
        {m.negativeReviews>0&&m.negativeReviews<3&&<p className="mt-1 text-sm text-muted-foreground">Too few negative reviews for a stable percentage.</p>}
      </div>
    </div>}

    {responseKnown&&typeof m.unansweredNegativeReviews==='number'&&m.unansweredNegativeReviews>0&&
      <p className="mt-4 text-sm"><span className="font-semibold" style={{color:pink}}>{m.unansweredNegativeReviews}</span> <span className="text-muted-foreground">recent negative review{m.unansweredNegativeReviews===1?'':'s'} left unanswered.</span></p>}

    {signal&&deepSample&&<div className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 text-sm font-medium" style={{color:pink}}><MessageSquare className="h-4 w-4"/>Customer relationship signal</div>
      <p className="mt-3 text-base leading-7 text-foreground">{signal}</p>
      {interpretation?.topReviewOpportunity&&<p className="mt-3 text-sm leading-6 text-muted-foreground"><span className="font-medium text-foreground">Biggest opportunity: </span>{interpretation.topReviewOpportunity}</p>}
    </div>}

    {Array.isArray(interpretation?.reviewThemes)&&interpretation.reviewThemes.length>0&&deepSample&&
      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">What customers talk about most</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {interpretation.reviewThemes.slice(0,6).map((t:any,i:number)=>{
            const sentiment=String(t?.sentiment||'').toLowerCase()
            const dot=sentiment.includes('pos')?'#0f9d58':sentiment.includes('neg')?pink:'#f4a400'
            return <div key={`${i}-${t?.theme||''}`} className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{background:dot}}/><span className="font-medium">{t?.theme||'Theme'}</span>{typeof t?.mentions==='number'&&<span className="text-xs text-muted-foreground">· {t.mentions} mentions</span>}</div>
              {t?.summary&&<p className="mt-2 text-sm leading-6 text-muted-foreground">{t.summary}</p>}
            </div>
          })}
        </div>
      </div>}

    {hasTopicMap&&<div className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">What customers repeatedly mention</p><span className="text-xs text-muted-foreground">{sampleSize} recent reviews · {topics[0]?.confidence||'limited'} confidence</span></div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Repeated restaurant themes, not a word cloud. These cover specific menu items, food outcomes, service, and the visit experience.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {topics.slice(0,8).map((topic:any,index:number)=>{
          const sentiment=String(topic?.sentiment||'mixed').toLowerCase()
          const dot=sentiment==='positive'?'#0f9d58':sentiment==='negative'?pink:'#f4a400'
          const category=String(topic?.category||'other')
          return <div key={`${index}-${topic?.topic||''}`} className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{background:dot}}/><span className="font-medium">{topic?.topic||'Topic'}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">{category}</span><span className="text-xs text-muted-foreground">· {topic?.mentions||0} mentions</span></div>{Array.isArray(topic?.examples)&&topic.examples[0]&&<p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">“{topic.examples[0]}”</p>}</div>
        })}
      </div>
    </div>}
  </section>
}
function Metric({icon,label,value,detail}:{icon:React.ReactNode;label:string;value:string;detail:string}){return <div className="rounded-2xl border border-border bg-card p-6"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{icon}{label}</div><div className="mt-4 text-3xl font-semibold tracking-[-0.05em]">{value}</div><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p></div>}
