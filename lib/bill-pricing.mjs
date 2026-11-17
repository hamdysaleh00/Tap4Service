// Money is integer piastres; rates are basis points (1400 = 14%). Both charges
// apply independently to the subtotal and are rounded once per combined bill.
export function receiptRates(restaurant, session) {
 const recorded=session?.finalBill||['FINALIZED','CLOSED'].includes(session?.status);
 const source=recorded?session:restaurant;
 return {taxBps:source?.taxBps??0,serviceBps:source?.serviceBps??0};
}
export function priceBill(subtotal, {taxBps=0,serviceBps=0}={}) {
 const tax=Math.round(subtotal*taxBps/10000),service=Math.round(subtotal*serviceBps/10000);
 return {subtotal,service,tax,total:subtotal+service+tax};
}
// Preview the whole table after adding a basket or replacing an editable order.
// This rounds charges on the combined subtotal, exactly like the server bill.
export function previewTableBill(orders,basket,session,editingOrderId) {
 const subtotal=[...orders.filter(o=>o.id!==editingOrderId),{lines:basket}]
  .reduce((sum,o)=>sum+o.lines.reduce((s,l)=>s+l.quantity*l.unitPrice,0),0);
 return priceBill(subtotal,session);
}
