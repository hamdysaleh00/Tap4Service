export function routeName(path){
 if(path==='/api/command')return 'command';if(path==='/api/state')return 'state';if(path==='/api/design')return 'design';if(path.startsWith('/api/auth/'))return 'auth';
 if(['/healthz','/readyz'].includes(path))return 'health';if(path.startsWith('/_next/'))return 'asset';return 'page';
}
export function requestEvent({id,route,method,status,duration}){
 // Explicit whitelist: no URL/query, body, token, headers, identity, error text,
 // SQL, stack, IP, restaurant slug, or arbitrary exception serialization.
 return {event:'http_request',request_id:id,route:['command','state','design','auth','health','asset','page'].includes(route)?route:'page',method:['GET','HEAD','POST','OPTIONS'].includes(method)?method:'OTHER',status:Number.isInteger(status)?status:500,duration_ms:Math.max(0,Math.round(duration)),severity:status>=500?'error':status>=400?'warning':'info'};
}
export function logRequest(input,logger=console){const event=requestEvent(input);const writer=event.status>=500?logger.error:event.status>=400?logger.warn:logger.log;writer.call(logger,JSON.stringify(event));return event;}
export function secureResponse(response,request,id){
 const result=new Response(request.method==='HEAD'?null:response.body,response);
 result.headers.set('X-Request-ID',id);result.headers.set('Cache-Control','private, no-store');result.headers.set('Referrer-Policy','no-referrer');result.headers.set('X-Content-Type-Options','nosniff');
 result.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');result.headers.set('X-Frame-Options','SAMEORIGIN');
 result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'self'; frame-ancestors 'self'");
 if(new URL(request.url).protocol==='https:')result.headers.set('Strict-Transport-Security','max-age=31536000');
 return result;
}
