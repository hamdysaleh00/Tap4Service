'use client';
import {useI18n} from './i18n';
import React,{useState,useMemo,useRef} from 'react';
import {Plus,Minus} from 'lucide-react';
import {calculatorLines,normalizeGuests,changeQuantity,calculateSplit} from '../lib/share-calculator.mjs';
type Quantities=Record<string,number>;
type Guest={id:string;number:number;quantities:Quantities};
type Line={id:string;key:string;name:string;nameAr?:string;quantity:number;unitPrice:number;modifiers?:{name:string;nameAr?:string}[]};
type Order={id:string;number?:number;lines:Omit<Line,'key'>[]};
type Bill={subtotal:number;discount?:number;service?:number;tax?:number;rounding?:number;total?:number};
type Share=Guest&Required<Bill>;
type Split={guests:Share[];unassigned:Share;remaining:Quantities;complete:boolean;bill:Required<Bill>};
export default function SplitBill({data:d}:{data:{orders?:Order[];bill?:Bill|null}}){
 const {t:tr,money,content}=useI18n();
 const lines=useMemo(()=>calculatorLines(d.orders??[]),[d.orders]);
 const signature=JSON.stringify(lines.map((l:Line)=>[l.key,l.quantity]));
 const [plan,setPlan]=useState<{signature:string;guests:Guest[]}>(()=>({signature,guests:[{id:'guest-1',number:1,quantities:{}}]}));
 const [activeId,setActiveId]=useState('guest-1'),nextGuest=useRef(2);
 // Persist reductions/removals, so later order updates cannot resurrect selections.
 // Adjust only when ordered quantities change, without an effect/render cycle on polling.
 const guests:Guest[]=plan.signature===signature?plan.guests:normalizeGuests(lines,plan.guests);
 if(plan.signature!==signature)setPlan({signature,guests});
 const setGuests=(update:(current:Guest[])=>Guest[])=>setPlan(current=>({signature,guests:update(normalizeGuests(lines,current.guests))}));
 let split:Split|null=null,error='';
 try{split=calculateSplit(d.orders??[],d.bill,guests) as Split}catch(e){error=e instanceof Error?e.message:'Invalid bill amounts. Refresh the table bill.'}
 if(!split)return <p role="alert" className="split-notice">{tr(error)}</p>;
 const share=split.guests.find(g=>g.id===activeId)??split.guests[0];
 const label=(g:Guest)=>tr('Guest {number}',{number:g.number});
 const change=(line:Line,delta:number)=>setGuests(current=>changeQuantity(lines,current,share.id,line.key,delta));
 const addGuest=()=>{const number=nextGuest.current++,id='guest-'+number;setGuests(current=>[...current,{id,number,quantities:{}}]);setActiveId(id)};
 const removeGuest=()=>{setGuests(current=>current.filter(g=>g.id!==share.id));setActiveId(guests.find(g=>g.id!==share.id)!.id)};
 const cash=(amount:number)=><>{money(amount)}{' '}{tr('EGP')}</>;
 return <section className="share-calculator">
  <p className="form-note">{tr('Select items for each guest in this local calculator. Nothing is saved, synchronized, or reserved. Staff still manage one combined bill.')}</p>
  <div className="split-guests">
   <label className="field"><span>{tr('Calculating for')}</span><select aria-label={tr('Calculating for')} value={share.id} onChange={e=>setActiveId(e.target.value)}>{split.guests.map((g:Share)=><option key={g.id} value={g.id}>{label(g)}</option>)}</select></label>
   <button className="button small" onClick={addGuest} disabled={guests.length>=30}>{tr('Add guest')}</button>
   {guests.length>1&&<button className="button small danger" onClick={removeGuest}>{tr('Remove guest')}</button>}
  </div>
  {!lines.length&&<p className="split-notice">{tr('No items in this table order yet.')}</p>}
  {lines.map((l:Line)=><div className="calculator-item" key={l.key}><div><strong>{content(l)}</strong>{(l.modifiers??[]).length>0&&<small>{(l.modifiers??[]).map(m=>content(m)).join(', ')}</small>}<p>{tr('Unit price:')}{' '}{cash(l.unitPrice)}</p><small>{tr('Ordered quantity:')}{' '}{l.quantity}{' · '}{tr('Unassigned quantity:')}{' '}{split.remaining[l.key]}</small></div><div className="calculator-choice"><div className="quantity"><button aria-label={tr('Decrease {p0}',{p0:content(l)})} disabled={!share.quantities[l.key]} onClick={()=>change(l,-1)}><Minus size={17}/></button><output aria-label={tr('Selected quantity for {p0}',{p0:content(l)})}>{share.quantities[l.key]||0}</output><button aria-label={tr('Increase {p0}',{p0:content(l)})} disabled={!split.remaining[l.key]} onClick={()=>change(l,1)}><Plus size={17}/></button></div><strong>{cash(l.unitPrice*share.quantities[l.key])}</strong></div></div>)}
  <div className="bill-totals" aria-live="polite"><div><span>{tr('Your Subtotal')}</span><strong>{cash(share.subtotal)}</strong></div>{split.bill.discount>0&&<div><span>{tr('Your discount share')}</span><span>−{cash(share.discount)}</span></div>}{split.bill.service>0&&<div><span>{tr('Your service charge share')}</span><span>{cash(share.service)}</span></div>}{split.bill.tax>0&&<div><span>{tr('Your tax share')}</span><span>{cash(share.tax)}</span></div>}{split.bill.rounding!==0&&<div><span>{tr('Your rounding adjustment')}</span><span>{cash(share.rounding)}</span></div>}<div className="total"><strong>{tr('Your Total')}</strong><strong data-testid="share-total">{cash(share.total)}</strong></div></div>
  <div className="split-summary" aria-live="polite"><h3>{tr('Split summary')}</h3>{split.guests.map((g:Share)=><div key={g.id}><span>{label(g)}</span><strong data-testid={'split-total-'+g.id}>{cash(g.total)}</strong></div>)}<div><span>{tr('Unassigned')}</span><strong data-testid="split-unassigned">{cash(split.unassigned.total)}</strong></div><div><span>{tr('Allocated total')}</span><strong data-testid="split-allocated">{cash(split.bill.total-split.unassigned.total)}</strong></div><div><span>{tr('Table total')}</span><strong>{cash(split.bill.total)}</strong></div><p data-testid="split-status">{split.complete?tr('All items allocated. Guest totals match the table bill.'):tr('Allocate the remaining items to complete the split.')}</p></div>
  <p className="form-note">{tr('Shares use the original bill charges and discounts. Remainder piastres are distributed consistently across guests and unassigned items. Amounts can change as the plan changes. No individual payments are recorded.')}</p>
 </section>;
}
