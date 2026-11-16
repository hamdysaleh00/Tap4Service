// Amounts are integer piastres. Use the order's price snapshots, never today's menu.
export function calculatorLines(orders=[]) {
 return orders.flatMap(o=>o.lines.map(l=>({...l,key:o.id+':'+l.id,orderNumber:o.number})));
}
export function clampSelection(lines,selection={}) {
 return Object.fromEntries(lines.map(l=>[l.key,Math.max(0,Math.min(l.quantity,Number.isFinite(selection[l.key])?Math.trunc(selection[l.key]):0))]));
}
// The plan belongs to one open calculator; it never reserves server-side items.
export function normalizeGuests(lines,guests) {
 const remaining=Object.fromEntries(lines.map(l=>[l.key,l.quantity]));
 return guests.map(guest=>{
  const quantities=clampSelection(lines,guest.quantities);
  for(const l of lines){quantities[l.key]=Math.min(quantities[l.key],remaining[l.key]);remaining[l.key]-=quantities[l.key]}
  return {...guest,quantities};
 });
}
export function changeQuantity(lines,guests,guestId,lineKey,delta) {
 const plan=normalizeGuests(lines,guests),guest=plan.find(g=>g.id===guestId),line=lines.find(l=>l.key===lineKey);
 if(!guest||!line||!Number.isFinite(delta))return plan;
 const others=plan.reduce((sum,g)=>sum+(g===guest?0:g.quantities[lineKey]),0);
 guest.quantities[lineKey]=Math.max(0,Math.min(line.quantity-others,guest.quantities[lineKey]+Math.trunc(delta)));
 return plan;
}
function amount(value) {
 if(!Number.isSafeInteger(value))throw new Error('Invalid bill amounts. Refresh the table bill.');
 return value;
}
// Largest remainder allocation. Deterministic ties follow guest order, with the
// unassigned bucket last. Work scales with guests, not the number of piastres.
function apportion(value,weights) {
 const sign=value<0?-1:1,n=BigInt(Math.abs(value)),whole=weights.reduce((s,w)=>s+BigInt(w),0n);
 if(!whole)return weights.map(()=>0);
 const products=weights.map(w=>n*BigInt(w)),parts=products.map(p=>Number(p/whole));
 const left=Number(n-parts.reduce((s,p)=>s+BigInt(p),0n));
 const ranked=products.map((p,i)=>({i,remainder:p%whole})).sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1);
 for(let i=0;i<left;i++)parts[ranked[i].i]++;
 return parts.map(p=>p===0?0:p*sign);
}
export function calculateSplit(orders,originalBill,guests) {
 if(!originalBill)throw new Error('The table bill is not available yet.');
 const lines=calculatorLines(orders);
 for(const l of lines)if(amount(l.unitPrice)<0||amount(l.quantity)<0)throw new Error('Invalid bill amounts. Refresh the table bill.');
 const plan=normalizeGuests(lines,guests);
 const remaining=Object.fromEntries(lines.map(l=>[l.key,l.quantity-plan.reduce((s,g)=>s+g.quantities[l.key],0)]));
 const buckets=[...plan,{id:'unassigned',quantities:remaining}].map(g=>({...g,subtotal:amount(lines.reduce((s,l)=>s+l.unitPrice*g.quantities[l.key],0))}));
 const subtotal=amount(buckets.reduce((s,g)=>s+g.subtotal,0));
 if(originalBill.subtotal!==undefined&&amount(originalBill.subtotal)!==subtotal)throw new Error('Invalid bill amounts. Refresh the table bill.');
 const discount=amount(originalBill.discount??0),service=amount(originalBill.service??0),tax=amount(originalBill.tax??0);
 const beforeRounding=amount(subtotal-discount+service+tax);
 const total=amount(originalBill.total??beforeRounding+(originalBill.rounding??0)),rounding=amount(total-beforeRounding);
 if(discount<0||discount>subtotal||service<0||tax<0||total<0||(originalBill.rounding!==undefined&&amount(originalBill.rounding)!==rounding))throw new Error('Invalid bill amounts. Refresh the table bill.');
 let weights=buckets.map(g=>g.subtotal);
 // Free items can still belong to a table with an explicit fixed charge.
 if(!subtotal)weights=buckets.map(g=>lines.reduce((s,l)=>s+g.quantities[l.key],0));
 if(!weights.some(Boolean))weights[weights.length-1]=1;
 for(const [key,value] of Object.entries({discount,service,tax})){
  const parts=apportion(value,weights);buckets.forEach((g,i)=>{g[key]=parts[i]});
 }
 buckets.forEach(g=>{g.total=amount(g.subtotal-g.discount+g.service+g.tax)});
 // A negative final adjustment must never debit a fully discounted share.
 const rounds=apportion(rounding,rounding<0?buckets.map(g=>g.total):weights);
 buckets.forEach((g,i)=>{g.rounding=rounds[i];g.total=amount(g.total+g.rounding)});
 const unassigned=buckets.pop();
 return {guests:buckets,unassigned,remaining,complete:!Object.values(remaining).some(Boolean)&&unassigned.total===0,bill:{subtotal,discount,service,tax,rounding,total}};
}
// Backwards-compatible personal calculator, with an explicit remainder bucket.
export function calculateShare(orders,originalBill,selection={}) {
 return calculateSplit(orders,originalBill,[{id:'guest',quantities:selection}]).guests[0];
}
