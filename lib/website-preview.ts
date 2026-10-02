export type WebsitePreview = {image:string|null;status:string}

// One entry per tab: deduplicate verification/audit requests without keeping
// screenshots from earlier restaurants indefinitely or sharing them across users.
let cached: {url:string;expires:number;request:Promise<WebsitePreview>} | undefined

export function preloadWebsitePreview(url:string):Promise<WebsitePreview> {
  try {
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Invalid protocol')
    url = parsed.href
  } catch {return Promise.resolve({image:null,status:'invalid_url'})}
  if (cached?.url===url && cached.expires>Date.now()) return cached.request
  const request = fetch('/api/evidence-preview', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({kind:'website',url}), signal:AbortSignal.timeout(30000),
  }).then(async (response):Promise<WebsitePreview>=>{
    if (!response.ok) return {image:null,status:'request_failed'}
    const result = await response.json()
    return {image:result.image||null,status:result.status||'unavailable'}
  }).catch(():WebsitePreview=>({image:null,status:'unavailable'}))
  cached = {url,expires:Date.now()+120000,request}
  void request.then(result=>{
    if (!result.image && cached?.request===request) cached=undefined
  })
  return request
}
