'use client';
import { useEffect,useState,useRef } from 'react';
import { securityHeaders } from './auth-client';
type Mode='login'|'activate'|'logout'|'account';
type AuthReply={error?:string;message?:string;enrollmentSecret?:string;requiresMfa?:boolean};
export default function AuthForm({mode}:{mode:Mode}){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[token,setToken]=useState(''),[secret,setSecret]=useState(''),[requiresMfa,setRequiresMfa]=useState(false);
 const activationRead=useRef(false);
 useEffect(()=>{
  if(mode!=='activate'||activationRead.current)return;activationRead.current=true;
  const value=new URLSearchParams(location.hash.slice(1)).get('token')||'';history.replaceState(null,'',location.pathname);
  if(!value){queueMicrotask(()=>setMessage('Open the account link from your email.'));return;}
  fetch('/api/auth/activation-info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:value}),cache:'no-store'}).then(async r=>{const data=await r.json() as AuthReply;if(!r.ok)throw new Error(data.error);setToken(value);setSecret(data.enrollmentSecret||'');setRequiresMfa(!!data.requiresMfa);}).catch(e=>setMessage(e.message));
 },[mode]);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setMessage('');const form=new FormData(event.currentTarget),fields=Object.fromEntries(form.entries());
  const action=mode==='account'?'password':mode;
  try{
   const headers:Record<string,string>={'Content-Type':'application/json',...(mode==='account'||mode==='logout'?await securityHeaders():{})};
   const response=await fetch('/api/auth/'+action,{method:'POST',headers,body:JSON.stringify({...fields,token}),cache:'no-store',credentials:'same-origin'});const data=await response.json() as AuthReply;if(!response.ok)throw new Error(data.error);
   if(mode==='activate'){setToken('');setSecret('');setMessage('Account secured. Sign in with your password and the next authenticator code.');return;}
   location.assign(mode==='login'?'/dashboard':'/login');
  }catch(error){setMessage(error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}
 }
 async function recover(form:HTMLFormElement){setBusy(true);try{const response=await fetch('/api/auth/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:new FormData(form).get('email')}),cache:'no-store'});const result=await response.json() as AuthReply;setMessage(result.message||result.error||'Please try again.');}catch{setMessage('Please try again.');}finally{setBusy(false);}}
 return <main className="welcome"><div className="welcome-card" style={{maxWidth:480,width:'100%'}}><h1>Tap2Serve</h1><h2>{mode==='login'?'Staff sign in':mode==='activate'?'Secure your account':mode==='logout'?'Sign out':'Account security'}</h2><form onSubmit={submit}>
  {mode==='login'&&<label className="field">Email<input name="email" type="email" autoComplete="username" required maxLength={254}/></label>}
  {mode==='account'&&<label className="field">Current password<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024}/></label>}
  {mode!=='logout'&&<label className="field">{mode==='login'?'Password':'New password (at least 15 characters)'}<input name="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='login'?undefined:15} maxLength={1024}/></label>}
  {secret&&<div><p>Add this key to your authenticator app, then enter its six-digit code. Keep this key private.</p><code style={{overflowWrap:'anywhere',userSelect:'all'}}>{secret}</code></div>}
  {(mode==='login'||mode==='account'||mode==='activate'&&requiresMfa)&&<label className="field">Authenticator code{mode!=='activate'?' (if enabled)':''}<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required={mode==='activate'&&requiresMfa}/></label>}
  {mode==='logout'&&<p>This signs out this browser. Changing your password revokes every session.</p>}
  <p role="status" aria-live="polite">{message}</p><button className="button primary full" disabled={busy||mode==='activate'&&!token}>{busy?'Please wait…':mode==='login'?'Sign in':mode==='logout'?'Sign out':'Save securely'}</button>
  {mode==='login'&&<button className="button full" type="button" disabled={busy} onClick={e=>{if(e.currentTarget.form)void recover(e.currentTarget.form);}}>Email password reset link</button>}
 </form>{mode!=='login'&&<a href="/login">Back to sign in</a>}{mode==='login'&&<p>Accounts are created by your restaurant administrator. There is no public registration.</p>}</div></main>;
}
