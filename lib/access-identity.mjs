// Cloudflare Access signs identity tokens with RS256. Never authorize from
// email/identity headers or unverified JWT claims on a public Worker Route.
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const json=value=>JSON.parse(new TextDecoder().decode(decode(value)));
export async function accessIdentity(token,options,fetchKeys=fetch){
 try{
  const issuer=options.TAP2SERVE_ACCESS_ISSUER,audience=options.TAP2SERVE_ACCESS_AUDIENCE;
  if(!issuer||!audience||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||typeof token!=='string'||token.length>16384)return null;
  const parts=token.split('.');if(parts.length!==3)return null;
  const [encodedHeader,encodedClaims,signature]=parts,header=json(encodedHeader),claims=json(encodedClaims),seconds=Date.now()/1000;
  const audiences=audience.split(',').map(s=>s.trim()).filter(Boolean);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==issuer||!Array.isArray(claims.aud)||!audiences.some(a=>claims.aud.includes(a))||!Number.isFinite(claims.exp)||claims.exp<=seconds||!Number.isFinite(claims.iat)||claims.iat>seconds+30||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>seconds+30))||typeof claims.sub!=='string'||!claims.sub||typeof claims.email!=='string'||!claims.email)return null;
  // Fetch only the configured team's HTTPS endpoint; no token-controlled URL.
  const response=await fetchKeys(`${issuer}/cdn-cgi/access/certs`,{redirect:'manual',signal:AbortSignal.timeout(5000)});if(!response.ok)return null;
  const jwks=await response.json();const jwk=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));if(!jwk)return null;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(signature),new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`)))return null;
  return {userId:claims.sub,email:claims.email,displayName:claims.email,fullName:null};
 }catch{return null;}
}
