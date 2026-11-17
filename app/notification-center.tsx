'use client';
import React,{useEffect,useRef,useState} from 'react';
import {Bell,X,Volume2,VolumeX} from 'lucide-react';
import {createNotificationTracker,notificationTitle} from '../lib/notifications.mjs';
import {createSoundAlerts} from '../lib/notification-sound.mjs';
import {useI18n} from './i18n';

const EMPTY_EVENTS:Event[]=[];
type Event={id:string;at:string;category:string;kind:string;changes:string[];tableLabel:string;orderId:string|null;orderNumber:number|null;readAt:string|null};
type Props={data:{user:{id:string};restaurant:{id:string;notifications?:Event[]}};command:(action:string,body:{ids:string[]},message:string)=>Promise<unknown>;onNavigate:(event:Event)=>void;busy:boolean;offline:boolean};
export default function NotificationCenter({data,command,onNavigate,busy,offline}:Props){
 const {t:tr,date,time}=useI18n(),events:Event[]=data.restaurant.notifications||EMPTY_EVENTS;
 const scope=data.user.id+':'+data.restaurant.id,preference='tab2serve.sound:'+scope;
 const [open,setOpen]=useState(false),[enabled,setEnabled]=useState(false),[unlocked,setUnlocked]=useState(false),[fallback,setFallback]=useState(false),[arrival,setArrival]=useState('');
 const sound=useRef<ReturnType<typeof createSoundAlerts>|null>(null);
 const tracker=useRef(createNotificationTracker({read:key=>JSON.parse(localStorage.getItem('tab2serve.notified:'+key)||'[]'),write:(key,ids)=>localStorage.setItem('tab2serve.notified:'+key,JSON.stringify(ids))}));
 const unread=events.filter(n=>!n.readAt);
 useEffect(()=>{
  sound.current=createSoundAlerts();
  // Browser preferences become available after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  try{setEnabled(localStorage.getItem(preference)==='enabled');}catch{}
  const sync=(e:StorageEvent)=>{if(e.key===preference){setEnabled(e.newValue==='enabled');if(e.newValue!=='enabled'){sound.current?.mute();setUnlocked(false);}}};
  window.addEventListener('storage',sync);
  return()=>{window.removeEventListener('storage',sync);void sound.current?.close();};
 },[preference]);
 useEffect(()=>{
  const incoming=tracker.current.accept(scope,events);
  if(!incoming.length)return;
  const latest=incoming[0];setArrival(tr(notificationTitle(latest)));
  if(enabled){const played=sound.current?.play(latest.changes.includes('items_cancelled')?'cancel':latest.category);if(!played){setFallback(true);setUnlocked(false);}}
 },[events,scope,enabled,tr]);
 async function toggleSound(){
  if(enabled&&unlocked){sound.current?.mute();setEnabled(false);setUnlocked(false);setFallback(false);try{localStorage.setItem(preference,'muted');}catch{}return;}
  const ok=await sound.current?.enable();setEnabled(true);setUnlocked(!!ok);setFallback(!ok);
  try{localStorage.setItem(preference,'enabled');}catch{}
  if(ok)sound.current?.play('session');
 }
 async function markRead(ids:string[]){try{await command('notification.read',{ids},'');}catch{/* The shared command reports failures and refreshes. */}}
 const details=(n:Event)=><>{n.tableLabel&&<span>{tr('Table')} {n.tableLabel}</span>}{n.orderNumber&&<span>{tr('Order #')}{n.orderNumber}</span>}<time dateTime={n.at}>{date(n.at)} {time(n.at)}</time></>;
 return <div className="notification-center">
  <button className="notification-button" aria-label={tr('Notifications')} aria-expanded={open} aria-controls="notification-history" onClick={()=>setOpen(!open)}><Bell size={20}/>{unread.length>0&&<b className="notification-count" aria-label={tr('Unread notifications')}>{unread.length}</b>}</button>
  {unread.length>0&&!open&&<button className="notification-banner" onClick={()=>setOpen(true)}><Bell size={16}/><span>{tr(notificationTitle(unread[0]))} · {tr('Table')} {unread[0].tableLabel} · {unread.length} {tr('Unread notifications')}</span></button>}
  <span className="sr-only" role="status" aria-live="polite">{arrival}</span>
  {open&&<section id="notification-history" className="notification-history" aria-label={tr('Notification history')}>
   <div className="panel-title"><h2>{tr('Notifications')} ({unread.length})</h2><button className="icon-button" aria-label={tr('Close notifications')} onClick={()=>setOpen(false)}><X size={18}/></button></div>
   <button className="button small" onClick={toggleSound}>{enabled&&unlocked?<VolumeX size={16}/>:<Volume2 size={16}/>} {tr(enabled&&unlocked?'Mute sound alerts':'Enable Sound Alerts')}</button>
   {fallback&&<p role="status" className="notification-fallback">{tr('Audio unavailable. Visual notifications remain active. Enable Sound Alerts to retry.')}</p>}
   {enabled&&!unlocked&&!fallback&&<p className="form-note">{tr('Enable Sound Alerts in this tab to allow audio.')}</p>}
   {unread.length>0&&<button className="text-button top-gap" disabled={busy||offline} onClick={()=>void markRead(unread.slice(0,100).map(n=>n.id))}>{tr('Mark notifications read')} ({Math.min(unread.length,100)})</button>}
   <div className="notification-list">{events.map(n=><article key={n.id} className={'notification-event '+(!n.readAt?'unread':'')} data-notification-id={n.id}>
    <strong>{tr(notificationTitle(n))}</strong>
    {n.changes.includes('items_added')&&<p>{tr('New items added')}</p>}{n.changes.includes('items_cancelled')&&<p>{tr('Items cancelled or removed')}</p>}
    <div className="notification-meta">{details(n)}</div>
    <div className="button-row"><button className="text-button" onClick={()=>{onNavigate(n);setOpen(false);if(!n.readAt&&!offline)void markRead([n.id]);}}>{tr(n.orderId?'View order':'View details')}</button>{!n.readAt&&<button className="text-button" disabled={busy||offline} onClick={()=>void markRead([n.id])}>{tr('Mark read')}</button>}{n.readAt&&<small>{tr('Read')} · {time(n.readAt)}</small>}</div>
   </article>)}{!events.length&&<p>{tr('No notifications yet.')}</p>}</div>
  </section>}
 </div>;
}
