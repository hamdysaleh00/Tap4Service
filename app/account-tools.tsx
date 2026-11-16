'use client';
import { useEffect,useState } from 'react';
import { securityHeaders } from './auth-client';
type Member={id:string;name:string;email:string;active:boolean};
type State={restaurant?:{id:string;members:Member[]};permissions?:string[]};
export default function AccountTools(){
 const [state,setState]=useState<State|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{fetch('/api/state',{cache:'no-store'}).then(async r=>{if(r.ok)setState(await r.json() as State);}).catch(()=>{});},[]);
 async function invite(member:Member){
  setBusy(true);setMessage('');try{const response=await fetch('/api/auth/invitations',{method:'POST',headers:{'Content-Type':'application/json',...await securityHeaders()},body:JSON.stringify({restaurantId:state?.restaurant?.id,memberId:member.id}),cache:'no-store'}),body=await response.json() as {error?:string};if(!response.ok)throw new Error(body.error);setMessage('If this account needs activation, an email has been sent.');}catch(e){setMessage(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}
 }
 if(!state?.permissions?.includes('staff.manage')||!state.permissions.includes('permissions.manage'))return null;
 return <section className="panel" style={{maxWidth:700,margin:'24px auto',padding:24}}><h2>Staff account activation</h2><p>Add staff and assign their permissions in Team &amp; permissions, then send an activation email here. Existing active accounts keep their password and identity.</p>{state.restaurant?.members.filter(m=>m.active).map(member=><div key={member.id} style={{display:'flex',gap:16,justifyContent:'space-between',alignItems:'center',padding:12}}><span>{member.name}<br/><small>{member.email}</small></span><button className="button" disabled={busy} onClick={()=>void invite(member)}>Send activation email</button></div>)}<p role="status">{message}</p></section>;
}
