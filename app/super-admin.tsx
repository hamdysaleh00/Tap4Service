'use client';
import { useState } from 'react';
import { restaurantOrigin } from '../lib/tenant-routing.mjs';
import DesignEditor from './design-editor';
import { LanguageSwitcher } from './i18n';
type Summary={id:string;slug:string;name:string;supportStatus:string;tableCount:number;subscription:{status:string;monthlyPerTable:number|null;setupFee:number|null};setup:Record<string,boolean>};
type Routing={base:string;origin:string};
type Command=(action:string,body:object,message?:string)=>Promise<unknown>;
export default function SuperAdmin({data,command,busy}:{data:{platform:boolean;platformRestaurants:Summary[];routing:Routing};command:Command;busy:boolean}){
 const [name,setName]=useState(''),[slug,setSlug]=useState('');
 if(!data.platform)return <main className="welcome"><h1>Platform access required</h1></main>;
 return <main style={{maxWidth:1100,margin:'auto',padding:'40px 24px'}}><LanguageSwitcher/><h1>Tap2Serve Super Admin</h1><nav style={{display:"flex",gap:20}}><a href="/account">Account security</a><a href="/login">Sign in again</a><a href="/logout">Sign out</a></nav><p>Provision restaurants and manage subscriptions. Open each restaurant’s dashboard to manage its service.</p><a href="/logout">Sign out</a><form className="panel" style={{padding:24,margin:'24px 0'}} onSubmit={async e=>{e.preventDefault();try{await command('platform.create',{name,slug},'Restaurant created');setName('');setSlug('');}catch{}}}><h2>Add restaurant</h2><label>Restaurant name<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>Unique subdomain slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={63} value={slug} onChange={e=>setSlug(e.target.value)}/></label><button className="button primary" disabled={busy}>Create restaurant</button></form><div className="billing-grid">{data.platformRestaurants.map(r=><Restaurant key={r.id} restaurant={r} routing={data.routing} command={command} busy={busy}/>)}</div></main>;
}
function Restaurant({restaurant:r,routing,command,busy}:{restaurant:Summary;routing:Routing;command:Command;busy:boolean}){
 const [status,setStatus]=useState(r.subscription.status);
 const [monthly,setMonthly]=useState(r.subscription.monthlyPerTable===null?'':String(r.subscription.monthlyPerTable/100));
 const [setupFee,setSetupFee]=useState(r.subscription.setupFee===null?'':String(r.subscription.setupFee/100));
 const [supportStatus,setSupportStatus]=useState(r.supportStatus),[setup,setSetup]=useState({...r.setup});
 const dashboard=restaurantOrigin(routing,r.slug,routing.origin)+'/dashboard';
 return <section className="bill-card"><form onSubmit={e=>{e.preventDefault();void command('platform.update',{restaurantId:r.id,status,monthlyPerTable:monthly===''?null:Math.round(Number(monthly)*100),setupFee:setupFee===''?null:Math.round(Number(setupFee)*100),setup,supportStatus},'Subscription saved').catch(()=>{});}}>
  <h2>{r.name}</h2><p>{r.slug} · {r.tableCount} tables</p><a className="button" href={dashboard}>Open restaurant dashboard</a>
  <label>Subscription status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="trial">Trial</option><option value="active">Active</option><option value="paused">Paused</option></select></label>
  <label>Monthly EGP per billable table<input type="number" min="0" step="0.01" value={monthly} onChange={e=>setMonthly(e.target.value)}/></label>
  <label>Setup fee (EGP)<input type="number" min="0" step="0.01" value={setupFee} onChange={e=>setSetupFee(e.target.value)}/></label>
  <label>Support status<input maxLength={80} value={supportStatus} onChange={e=>setSupportStatus(e.target.value)}/></label>
  <div className="setup-checklist">{Object.entries(setup).map(([key,value])=><label key={key}><input type="checkbox" checked={value} onChange={e=>setSetup({...setup,[key]:e.target.checked})}/>{key}</label>)}</div>
  <button className="button" disabled={busy}>Save subscription and setup</button>
 </form><DesignEditor restaurantId={r.id} command={command} platform/></section>;
}
