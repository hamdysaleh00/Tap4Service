import { AppError } from './domain.mjs';
import { randomToken,tokenHash,equal,hashPassword,verifyPassword,validatePassword,rateKey,newTotpSecret,checkTotp,encryptMfa,decryptMfa } from './auth-crypto.mjs';

export const SESSION_COOKIE='__Host-t2s_session';
const ABSOLUTE_MS=8*60*60*1000,IDLE_MS=30*60*1000,RECENT_MS=5*60*1000;
const COOKIE_FLAGS='Path=/; HttpOnly; Secure; SameSite=Lax';
export const clearSessionCookie=()=>`${SESSION_COOKIE}=; ${COOKIE_FLAGS}; Max-Age=0`;
export const normalizeEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
const validEmail=value=>value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const failure=()=>new AppError('Unable to sign in. Check your credentials and authenticator code.',401);
const statement=(sql,...params)=>({sql,params});
const isConflict=e=>String(e.message).includes('tap2serve_auth_conflict')||String(e.cause?.message).includes('tap2serve_auth_conflict');
export function createAuthService(db,options){
 const now=options.now??Date.now,bind=s=>db.prepare(s.sql).bind(...s.params);
 const audit=(event,userId=null,actorId=null)=>statement('INSERT INTO auth_events(id,user_id,actor_id,event,at) VALUES(?,?,?,?,?)',crypto.randomUUID(),userId,actorId,event,now());
 const runBatch=async statements=>{try{return await db.batch(statements.map(bind));}catch(e){if(isConflict(e))throw new AppError('This authentication request expired or changed. Try again.',409);throw e;}};
 const guard=(sql,...params)=>{const id=crypto.randomUUID();return {start:statement(`INSERT INTO auth_guards(id,valid) VALUES(?,COALESCE((${sql}),0))`,id,...params),end:statement('DELETE FROM auth_guards WHERE id=?',id)};};
 async function ready(){
  let origin;try{origin=new URL(options.origin);}catch{throw new AppError('Authentication is not configured.',503);}
  const local=options.allowLocalHttp===true&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)&&origin.protocol==='http:';
  if(origin.origin!==options.origin||(!local&&origin.protocol!=='https:')||typeof options.rateSecret!=='string'||options.rateSecret.length<32||Buffer.from(options.mfaKey??'','base64').length!==32)throw new AppError('Authentication is not configured.',503);
  const config=await db.prepare("SELECT ready,schema_version FROM auth_config WHERE id='main'").first();if(config?.ready!==1||config.schema_version!==1)throw new AppError('Authentication is not configured.',503);
 }
 function originCheck(request){
  if(new URL(request.url).origin!==options.origin||request.headers.get('origin')!==options.origin||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('Cross-origin request rejected.',403);
 }
 async function rate(request,scope,email='',limits={account:10,ip:30}){
  const period=15*60*1000,window=Math.floor(now()/period),expires=(window+1)*period;
  const ip=request.headers.get('cf-connecting-ip')||'unavailable';
  const keys=[await rateKey(options.rateSecret,`${scope}:ip:${ip}:${window}`),...(email?[await rateKey(options.rateSecret,`${scope}:email:${email}:${window}`)]:[])];
  const results=await runBatch(keys.map(key=>statement('INSERT INTO auth_rate_buckets(bucket_key,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket_key) DO UPDATE SET count=count+1 RETURNING count',key,expires)));
  if(results[0].results[0].count>limits.ip||email&&results[1].results[0].count>limits.account)throw new AppError('Too many attempts. Try again later.',429);
 }
 function cookieToken(request){const cookies=(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(SESSION_COOKIE+'='));if(cookies.length!==1)return null;const value=cookies[0].slice(SESSION_COOKIE.length+1);return /^[\w-]{43}$/.test(value)?value:null;}
 async function authenticate(request){
  await ready();if(new URL(request.url).origin!==options.origin)throw new AppError('Cross-origin request rejected.',403);
  const token=cookieToken(request);if(!token)return null;
  const hash=await tokenHash(token),row=await db.prepare('SELECT s.*,a.email,a.display_name,a.active,a.is_super_admin,a.version,a.email_verified_at,a.mfa_secret_enc FROM auth_sessions s JOIN auth_accounts a ON a.user_id=s.user_id WHERE s.token_hash=? AND s.origin=?').bind(hash,options.origin).first();
  if(!row||!row.active||!row.email_verified_at||row.account_version!==row.version||row.expires_at<=now()||row.seen_at+IDLE_MS<=now()||row.is_super_admin&&!row.mfa_secret_enc)return null;
  if(row.seen_at+5*60*1000<now())await db.prepare('UPDATE auth_sessions SET seen_at=? WHERE token_hash=? AND account_version=?').bind(now(),hash,row.version).run();
  return {user:{id:row.user_id,email:row.email,name:row.display_name,authProvider:'independent',isSuperAdmin:!!row.is_super_admin},csrf:await tokenHash('tap2serve:csrf:'+token),tokenHash:hash,session:row};
 }
 async function requireSession(request,{csrf=false,recent=false,superAdmin=false}={}){
  const auth=await authenticate(request);if(!auth)throw new AppError('Staff sign-in required.',401);
  if(csrf){originCheck(request);if(!equal(auth.csrf,request.headers.get('x-csrf-token')??''))throw new AppError('Invalid request.',403);}
  if(recent&&auth.session.authenticated_at+RECENT_MS<now())throw new AppError('Sign in again before this sensitive action.',403);
  if(superAdmin&&!auth.user.isSuperAdmin)throw new AppError('Platform administrator access required.',403);
  return auth;
 }
 async function login(request,body){
  await ready();originCheck(request);const email=normalizeEmail(body.email);await rate(request,'login',email.slice(0,254));
  const account=validEmail(email)?await db.prepare('SELECT * FROM auth_accounts WHERE email=?').bind(email).first():null;
  const passwordValid=await verifyPassword(body.password,account?.password_hash);
  let step=null;
  if(account?.mfa_secret_enc)step=await checkTotp(await decryptMfa(account.mfa_secret_enc,options.mfaKey,account.user_id),body.code,now(),account.mfa_last_step);
  if(!passwordValid||!account?.active||!account.email_verified_at||account.is_super_admin&&!account.mfa_secret_enc||account.mfa_secret_enc&&step===null){await runBatch([audit('login_failed',account?.user_id??null)]);throw failure();}
  const g=guard('SELECT version=? AND active=1 AND (mfa_last_step=? OR mfa_secret_enc IS NULL) FROM auth_accounts WHERE user_id=?',account.version,account.mfa_last_step,account.user_id);
  const token=randomToken(),hash=await tokenHash(token),time=now();
  const old=cookieToken(request),statements=[g.start];
  if(step!==null)statements.push(statement('UPDATE auth_accounts SET mfa_last_step=? WHERE user_id=?',step,account.user_id));
  if(old)statements.push(statement('DELETE FROM auth_sessions WHERE token_hash=?',await tokenHash(old)));
  statements.push(statement('INSERT INTO auth_sessions(token_hash,user_id,account_version,origin,created_at,seen_at,expires_at,authenticated_at) VALUES(?,?,?,?,?,?,?,?)',hash,account.user_id,account.version,options.origin,time,time,time+ABSOLUTE_MS,time),audit('login_success',account.user_id),g.end);
  await runBatch(statements);
  return {cookie:`${SESSION_COOKIE}=${token}; ${COOKIE_FLAGS}; Max-Age=${ABSOLUTE_MS/1000}`,csrf:await tokenHash('tap2serve:csrf:'+token)};
 }
 async function logout(request){const auth=await requireSession(request,{csrf:true});await runBatch([statement('DELETE FROM auth_sessions WHERE token_hash=?',auth.tokenHash),audit('logout',auth.user.id)]);return clearSessionCookie();}
 async function issueToken(account,kind,actorId=null){
  const raw=randomToken(),hash=await tokenHash(raw),time=now();
  await runBatch([statement('DELETE FROM auth_action_tokens WHERE user_id=? AND kind=? AND used_at IS NULL',account.user_id,kind),statement('INSERT INTO auth_action_tokens(token_hash,user_id,kind,account_version,origin,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)',hash,account.user_id,kind,account.version,options.origin,time+60*60*1000,actorId,time),audit(kind+'_issued',account.user_id,actorId)]);
  try{
   if(!options.sendEmail)throw new Error('Mail delivery unavailable.');
   await options.sendEmail({to:account.email,subject:kind==='activate'?'Activate your Tap2Serve staff account':'Reset your Tap2Serve password',text:`Open ${options.origin}/activate#token=${raw}\nThis link expires in one hour. If you did not expect it, ignore this message.`});
  }catch{await runBatch([statement('DELETE FROM auth_action_tokens WHERE token_hash=?',hash),audit('delivery_failed',account.user_id,actorId)]);throw new AppError('Account email delivery is unavailable. Contact your administrator.',503);}
 }
 async function invitation(request,body){
  const auth=await requireSession(request,{csrf:true,recent:true});
  await rate(request,'invitation',auth.user.email,{account:20,ip:60});
  if(!options.authorizeInvitation)throw new AppError('Account invitation is not configured.',503);
  let {email,name,userId}=await options.authorizeInvitation(auth.user,body.restaurantId,body.memberId);
  email=normalizeEmail(email);if(!validEmail(email))throw new AppError('Enter a valid staff email.');
  let account=await db.prepare('SELECT * FROM auth_accounts WHERE email=?').bind(email).first();
  if(account&&userId&&account.user_id!==userId)throw new AppError('This email has a conflicting identity mapping. Contact the platform administrator.',409);
  if(account?.password_hash)return {ok:true};
  if(!account){
   userId||=crypto.randomUUID();
   await runBatch([statement('INSERT INTO users(id) VALUES(?) ON CONFLICT DO NOTHING',userId),statement('INSERT INTO auth_accounts(user_id,email,display_name,created_at) VALUES(?,?,?,?)',userId,email,String(name||email).slice(0,100),now()),audit('account_invited',userId,auth.user.id)]);
   account=await db.prepare('SELECT * FROM auth_accounts WHERE user_id=?').bind(userId).first();
  }
  await issueToken(account,'activate',auth.user.id);return {ok:true};
 }
 async function recovery(request,body){
  await ready();originCheck(request);const email=normalizeEmail(body.email);await rate(request,'recovery',email.slice(0,254),{account:3,ip:15});
  const deliver=async()=>{
   const account=validEmail(email)?await db.prepare('SELECT * FROM auth_accounts WHERE email=? AND active=1 AND email_verified_at IS NOT NULL').bind(email).first():null;
   if(account)try{await issueToken(account,'reset');}catch{/* Delivery failure is audited without tokens. */}
  };
  // Production moves account lookup and mail latency off the public response.
  if(options.background)options.background(deliver());else await deliver();
  return {ok:true,message:'If an eligible account exists, an email has been sent.'};
 }
 async function actionToken(raw){
  if(typeof raw!=='string'||!(/^[\w-]{43}$/).test(raw))throw new AppError('This authentication link is invalid or expired.',400);
  const hash=await tokenHash(raw),row=await db.prepare('SELECT t.*,a.email,a.display_name,a.active,a.version,a.is_super_admin,a.mfa_secret_enc,a.mfa_last_step,a.password_hash FROM auth_action_tokens t JOIN auth_accounts a ON a.user_id=t.user_id WHERE t.token_hash=? AND t.origin=?').bind(hash,options.origin).first();
  if(!row||row.used_at!==null||row.expires_at<=now()||!row.active||row.account_version!==row.version)throw new AppError('This authentication link is invalid or expired.',400);
  return row;
 }
 async function activationInfo(request,body){
  await ready();originCheck(request);await rate(request,'activation-info','',{ip:30});const row=await actionToken(body.token);
  if(row.is_super_admin&&!row.mfa_secret_enc){
   const encrypted=await encryptMfa(newTotpSecret(),options.mfaKey,row.user_id);
   await db.prepare('UPDATE auth_action_tokens SET mfa_enrollment_enc=? WHERE token_hash=? AND mfa_enrollment_enc IS NULL AND used_at IS NULL').bind(encrypted,row.token_hash).run();
   const stored=await actionToken(body.token),secret=await decryptMfa(stored.mfa_enrollment_enc,options.mfaKey,row.user_id);
   return {requiresMfa:true,enrollmentSecret:secret,otpauth:`otpauth://totp/Tap2Serve:${encodeURIComponent(row.email)}?secret=${secret}&issuer=Tap2Serve&digits=6&period=30`};
  }
  return {requiresMfa:!!row.mfa_secret_enc};
 }
 async function activate(request,body){
  await ready();originCheck(request);await rate(request,'activation','',{ip:15});const row=await actionToken(body.token);
  try{validatePassword(body.password);}catch(e){throw new AppError(e.message);}
  const secretEnc=row.mfa_secret_enc||row.mfa_enrollment_enc;let step=null;
  if(secretEnc)step=await checkTotp(await decryptMfa(secretEnc,options.mfaKey,row.user_id),body.code,now(),row.mfa_last_step);
  if(row.is_super_admin&&!secretEnc||secretEnc&&step===null)throw new AppError('Enter a valid authenticator code.',400);
  const passwordHash=await hashPassword(body.password),g=guard('SELECT t.used_at IS NULL AND t.expires_at>? AND t.account_version=a.version AND a.active=1 AND a.version=? FROM auth_action_tokens t JOIN auth_accounts a ON a.user_id=t.user_id WHERE t.token_hash=?',now(),row.version,row.token_hash);
  await runBatch([g.start,statement('UPDATE auth_accounts SET password_hash=?,email_verified_at=COALESCE(email_verified_at,?),mfa_secret_enc=?,mfa_last_step=?,version=version+1 WHERE user_id=?',passwordHash,now(),secretEnc,step??-1,row.user_id),statement('UPDATE auth_action_tokens SET used_at=? WHERE user_id=?',now(),row.user_id),statement('DELETE FROM auth_sessions WHERE user_id=?',row.user_id),audit(row.kind==='activate'?'account_activated':'password_reset',row.user_id),g.end]);
  return {ok:true};
 }
 async function changePassword(request,body){
  const auth=await requireSession(request,{csrf:true});await rate(request,'password-change',auth.user.email,{account:5,ip:20});
  const account=await db.prepare('SELECT * FROM auth_accounts WHERE user_id=?').bind(auth.user.id).first();
  if(!await verifyPassword(body.currentPassword,account.password_hash))throw failure();
  let step=null;if(account.mfa_secret_enc)step=await checkTotp(await decryptMfa(account.mfa_secret_enc,options.mfaKey,account.user_id),body.code,now(),account.mfa_last_step);
  if(account.mfa_secret_enc&&step===null)throw failure();
  let passwordHash;try{passwordHash=await hashPassword(body.password);}catch(e){throw new AppError(e.message);}
  const g=guard('SELECT version=? AND active=1 AND mfa_last_step=? FROM auth_accounts WHERE user_id=?',account.version,account.mfa_last_step,auth.user.id);
  await runBatch([g.start,statement('UPDATE auth_accounts SET password_hash=?,version=version+1,mfa_last_step=? WHERE user_id=?',passwordHash,step??-1,auth.user.id),statement('DELETE FROM auth_sessions WHERE user_id=?',auth.user.id),statement('UPDATE auth_action_tokens SET used_at=? WHERE user_id=?',now(),auth.user.id),audit('password_changed',auth.user.id),g.end]);return {ok:true};
 }
 async function disableAccount(request,body){
  const auth=await requireSession(request,{csrf:true,recent:true,superAdmin:true});if(typeof body.userId!=='string'||body.userId===auth.user.id)throw new AppError('You cannot disable your own account.');
  await runBatch([statement('UPDATE auth_accounts SET active=0,version=version+1 WHERE user_id=?',body.userId),statement('DELETE FROM auth_sessions WHERE user_id=?',body.userId),statement('UPDATE auth_action_tokens SET used_at=? WHERE user_id=?',now(),body.userId),audit('account_disabled',body.userId,auth.user.id)]);return {ok:true};
 }
 return {ready,authenticate,requireSession,originCheck,login,logout,invitation,recovery,activationInfo,activate,changePassword,disableAccount};
}
