// Money is integer piastres; rates are basis points (1400 = 14%). Both charges
// apply independently to the subtotal and are rounded once per combined bill.
export function receiptRates(restaurant, session) {
 const recorded=session?.finalBill||['FINALIZED','CLOSED'].includes(session?.status);
 const source=recorded?session:restaurant;
 return {taxBps:source?.taxBps??0,serviceBps:source?.serviceBps??0};
}
export function priceBill(subtotal, {taxBps=0,serviceBps=0}={}) {
 const tax=roundedRatio(subtotal,taxBps,10000),service=roundedRatio(subtotal,serviceBps,10000);
 return {subtotal,service,tax,total:subtotal+service+tax};
}
// Multiply in integer space, including large safe-integer bill snapshots. Never
// lose a piastre because the intermediate product exceeded Number's precision.
export function roundedRatio(value,numerator,denominator){
 const divisor=BigInt(denominator);
 return Number((BigInt(value)*BigInt(numerator)+divisor/2n)/divisor);
}
export const activeQuantity=line=>Math.max(0,line.quantity-(line.cancelledQuantity||0));
// Item discounts are applied first, then the order discount; charges use the net
// taxable subtotal. Snapshot amounts and per-line allocations travel with the bill.
export function priceOrders(orders,session={}) {
 const lines=orders.filter(o=>!o.cancelledAt).flatMap(o=>o.lines);
 const subtotal=lines.reduce((sum,l)=>sum+activeQuantity(l)*l.unitPrice,0);
 const discounts=(session.discounts||[]).filter(d=>!d.revokedAt),lineDiscounts={};
 for(const line of lines){
  const base=activeQuantity(line)*line.unitPrice,d=discounts.find(d=>d.lineId===line.id);
  if(d)lineDiscounts[line.id]=Math.min(base,d.kind==='percent'?roundedRatio(base,d.value,10000):d.value);
 }
 const itemDiscount=Object.values(lineDiscounts).reduce((s,n)=>s+n,0),base=subtotal-itemDiscount;
 const d=discounts.find(d=>!d.lineId),orderDiscount=d?Math.min(base,d.kind==='percent'?roundedRatio(base,d.value,10000):d.value):0;
 const discount=itemDiscount+orderDiscount,priced=priceBill(subtotal-discount,session);
 return {...priced,subtotal,...(discounts.length?{discount,lineDiscounts,orderDiscount}:{})};
}
export function tableBill(restaurant,session){
 const orders=restaurant.orders.filter(o=>o.sessionId===session.id);
 const pricing=session.finalBill||priceOrders(orders,{...session,...receiptRates(restaurant,session)});
 const sum=rows=>rows.filter(r=>r.sessionId===session.id).reduce((n,r)=>n+r.amount,0);
 const paid=sum(restaurant.payments),refunds=sum(restaurant.pos?.refunds||[]),credits=sum(restaurant.pos?.credits||[]);
 return {...pricing,paid,...(refunds||credits?{refunded:refunds,credits,netPaid:paid-refunds}:{}),due:Math.max(0,pricing.total-credits-paid+refunds)};
}
// Preview the whole table after adding a basket or replacing an editable order.
// This rounds charges on the combined subtotal, exactly like the server bill.
export function previewTableBill(orders,basket,session,editingOrderId) {
 return priceOrders([...orders.filter(o=>o.id!==editingOrderId),{lines:basket}],session);
}
