// POS commands share the existing restaurant CAS transaction in both adapters.
// No client-supplied identity or calculated financial total is trusted.
import { AppError, uid } from './domain-core.mjs';
import { activeQuantity, priceOrders, receiptRates, tableBill as bill, roundedRatio } from './bill-pricing.mjs';

export const POS_PERMISSIONS=['orders.create','orders.edit','orders.cancel','billing.discount','billing.approve_adjustment','billing.refund','billing.void','shifts.manage','shifts.supervise','finance.read'];
export const ROLE_PERMISSIONS={
 waiter:['menu.read','orders.read','orders.create','orders.edit','orders.cancel','orders.manage','sessions.read','sessions.open','staff_calls.read','staff_calls.resolve'],
 cashier:['menu.read','orders.read','orders.create','orders.edit','orders.cancel','orders.manage','sessions.read','sessions.open','sessions.close','billing.read','billing.print','billing.finalize','billing.record_payment','billing.discount','shifts.manage'],
 manager:null,owner:null,
};
const check=(ok,message,status=400)=>{if(!ok)throw new AppError(message,status);};
const at=()=>new Date().toISOString();
const amount=(n,zero=false)=>check(Number.isSafeInteger(n)&&n>=(zero?0:1)&&n<=1000000000,'Enter a valid amount in piastres.');
const reason=b=>{check(typeof b.reason==='string'&&b.reason.trim().length>=3&&b.reason.length<=500,'A reason of 3 to 500 characters is required.');return b.reason.trim();};
const requirePermission=(m,p)=>check(m.permissions.includes(p),'Missing permission: '+p,403);
export function posState(t){return t.pos||{version:1,enabled:false,shifts:[],movements:[],refunds:[],credits:[],handovers:[],events:[],operations:[]};}
export function upgradePOS(t){
 if(!t.pos)t.pos=posState(t);
 // Existing administrators gain explicit POS permissions once, ordinary staff do
 // not gain financial privileges. The marker lives with the restaurant, not state.
 if(!t.pos.permissionsUpgraded){for(const m of t.members)if(m.permissions.includes('permissions.manage'))m.permissions=[...new Set([...m.permissions,...POS_PERMISSIONS])];t.pos.permissionsUpgraded=true;}
}
export function permittedTable(m,tableId){check(!m.allowedTableIds?.length||m.allowedTableIds.includes(tableId),'This table is outside your assigned area.',403);}
export function activeShift(t,m){return posState(t).shifts.find(s=>s.memberId===m.id&&s.status==='OPEN');}
export function paymentShift(t,m){const shift=activeShift(t,m);check(!(posState(t).enabled||m.role==='cashier')||shift,'Open your cashier shift before recording payments or refunds.',409);return shift;}
export function shiftSummary(t,shift){
 const pos=posState(t),payments=t.payments.filter(p=>p.shiftId===shift.id),refunds=pos.refunds.filter(r=>r.shiftId===shift.id),moves=pos.movements.filter(r=>r.shiftId===shift.id);
 const sum=(rows,method)=>rows.filter(r=>!method||r.method===method).reduce((n,r)=>n+r.amount,0);
 const cashPayments=shift.collections?.cashPayments??sum(payments,'cash'),cardPayments=shift.collections?.cardPayments??sum(payments,'card'),cashRefunds=sum(refunds,'cash'),cardRefunds=sum(refunds,'card');
 const cashIn=sum(moves.filter(r=>r.kind==='in')),cashOut=sum(moves.filter(r=>r.kind==='out'));
 const expectedCash=shift.openingCash+cashPayments+cashIn-cashRefunds-cashOut;
 return {...shift,cashPayments,cardPayments,cashRefunds,cardRefunds,cashIn,cashOut,expectedCash,...(shift.actualCash!==undefined?{discrepancy:shift.actualCash-expectedCash}:{})};
}
function event(t,m,action,b,detail){
 const e={id:uid(),at:at(),memberId:m.id,userId:m.userId,by:m.name||m.email,action,reason:b.reason?.trim(),...detail};
 t.pos.events.push(e);t.audit.push({...e,detail:JSON.stringify(detail).slice(0,500)});return e;
}
function version(s,b){check(s&&s.version===b.expectedVersion,'This session changed. Refresh and review the latest bill.',409);}
function mutable(s,b){version(s,b);check(!s.releasedAt&&s.status==='OPEN','Reopen ordering before changing this bill. Finalized bills require credits or refunds.',409);}
function unusedKey(t,m,b){
 check(typeof b.key==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(b.key),'A request identifier is required.');
 const payload=JSON.stringify(Object.fromEntries(Object.entries(b).filter(([k])=>k!=='key').sort(([a],[c])=>a.localeCompare(c))));
 const old=t.pos.operations.find(o=>o.key===b.key);
 check(!t.payments.some(p=>p.key===b.key),'Request identifier was already used.',409);
 if(old){check(old.memberId===m.id&&old.payload===payload,'Request identifier was reused with different data.',409);return {duplicate:old.result};}
 return {save:result=>{t.pos.operations.push({key:b.key,memberId:m.id,payload,result,at:at()});return result;}};
}
function ownShift(t,m,id,supervise=false){const shift=t.pos.shifts.find(s=>s.id===id);check(shift,'Shift not found.',404);check(shift.memberId===m.id||supervise&&m.permissions.includes('shifts.supervise'),'You may only operate your own shift.',403);return shift;}
const day=(date,timeZone)=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
export function financialReport(t,filter={}){
 const timeZone=t.timeZone||'Africa/Cairo',today=day(at(),timeZone),from=filter.from||today,to=filter.to||from;
 check(/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&from<=to,'Choose a valid report date range.');
 const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 check(validDate(from)&&validDate(to),'Choose a valid report date range.');
 const inPeriod=stamp=>stamp&&day(stamp,timeZone)>=from&&day(stamp,timeZone)<=to;
 const match=row=>(!filter.cashierId||row.memberId===filter.cashierId)&&(!filter.shiftId||row.shiftId===filter.shiftId);
 const sales=t.sessions.filter(s=>s.finalBill&&inPeriod(s.finalizedAt)&&match({memberId:s.finalizedByMemberId,shiftId:s.finalizedShiftId}));
 const payments=t.payments.filter(p=>inPeriod(p.createdAt)&&match(p));
 const refunds=posState(t).refunds.filter(r=>inPeriod(r.createdAt)&&match(r));
 const credits=posState(t).credits.filter(r=>inPeriod(r.createdAt)&&match(r));
 const sum=(xs,key)=>xs.reduce((n,x)=>n+(x[key]||0),0);
 const saleRows=sales.map(s=>({...s.finalBill,createdAt:s.finalizedAt,memberId:s.finalizedByMemberId||null,shiftId:s.finalizedShiftId||null,sessionId:s.id}));
 const grossSales=sum(saleRows,'total'),creditTotal=sum(credits,'amount');
 const group=key=>[...new Set([...saleRows,...payments,...refunds,...credits].map(r=>r[key]||'legacy'))].map(id=>({id,sales:sum(saleRows.filter(r=>(r[key]||'legacy')===id),'total'),credits:sum(credits.filter(r=>(r[key]||'legacy')===id),'amount'),collections:sum(payments.filter(r=>(r[key]||'legacy')===id),'amount'),refunds:sum(refunds.filter(r=>(r[key]||'legacy')===id),'amount')}));
 const days=[...new Set([...saleRows,...payments,...refunds,...credits].map(r=>day(r.createdAt,timeZone)))].sort().map(date=>({date,sales:sum(saleRows.filter(r=>day(r.createdAt,timeZone)===date),'total'),credits:sum(credits.filter(r=>day(r.createdAt,timeZone)===date),'amount'),collections:sum(payments.filter(r=>day(r.createdAt,timeZone)===date),'amount'),refunds:sum(refunds.filter(r=>day(r.createdAt,timeZone)===date),'amount')}));
 return {from,to,timeZone,grossSales,credits:creditTotal,netSales:grossSales-creditTotal,merchandiseRevenue:sum(saleRows,'subtotal')-sum(saleRows,'discount')-creditTotal+sum(credits,'tax')+sum(credits,'service'),netTax:sum(saleRows,'tax')-sum(credits,'tax'),netService:sum(saleRows,'service')-sum(credits,'service'),discounts:sum(saleRows,'discount'),tax:sum(saleRows,'tax'),service:sum(saleRows,'service'),creditedTax:sum(credits,'tax'),creditedService:sum(credits,'service'),collections:sum(payments,'amount'),refunds:sum(refunds,'amount'),cashPayments:sum(payments.filter(p=>p.method==='cash'),'amount'),cardPayments:sum(payments.filter(p=>p.method==='card'),'amount'),cashRefunds:sum(refunds.filter(p=>p.method==='cash'),'amount'),cardRefunds:sum(refunds.filter(p=>p.method==='card'),'amount'),outstanding:t.sessions.reduce((n,s)=>n+bill(t,s).due,0),byCashier:group('memberId'),byShift:group('shiftId'),daily:days,shifts:posState(t).shifts.filter(s=>inPeriod(s.closedAt||s.openedAt)&&(!filter.cashierId||s.memberId===filter.cashierId)&&(!filter.shiftId||s.id===filter.shiftId)).map(s=>shiftSummary(t,s)),transactions:[...payments.map(p=>({...p,type:'payment'})),...refunds.map(p=>({...p,type:'refund'})),...credits.map(p=>({...p,type:'credit'}))].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))};
}
export function executePOS(t,m,b,helpers){
 const {action}=b;if(!['cashier.order','cashier.edit','cashier.cancel','cashier.reopen','billing.discount','billing.remove_discount','billing.refund','billing.void','shift.open','shift.move','shift.close','handover.declare','handover.confirm','finance.report'].includes(action))return null;
 const permission=action==='cashier.order'?'orders.create':action==='cashier.edit'?'orders.edit':action==='cashier.cancel'?'orders.cancel':action==='cashier.reopen'?'orders.edit':action.startsWith('shift.')||action.startsWith('handover.')?'shifts.manage':action==='finance.report'?'finance.read':action==='billing.discount'||action==='billing.remove_discount'?'billing.discount':action==='billing.refund'?'billing.refund':'billing.void';
 requirePermission(m,permission);
 if(action==='finance.report')return financialReport(t,b);
 const op=unusedKey(t,m,b);if(op.duplicate)return op.duplicate;
 let s=t.sessions.find(s=>s.id===b.sessionId),o=t.orders.find(o=>o.id===b.orderId),result={ok:true};
 if(o){check(!s||s.id===o.sessionId,'Order not found in this session.',404);s=t.sessions.find(s=>s.id===o.sessionId);}
 if(s)permittedTable(m,s.tableId);
 if(action==='cashier.order'){
  const table=t.tables.find(tb=>tb.id===b.tableId&&tb.enabled);check(table,'Table not found.',404);permittedTable(m,table.id);
  const lines=helpers.lines(t,b.lines,[],s);
  s=helpers.currentSession(t,table);
  if(!s){requirePermission(m,'sessions.open');const id=helpers.open(table);s=t.sessions.find(s=>s.id===id);}
  else check(s.status==='OPEN','Reopen ordering or open a new table session first.',409);
  if(b.sessionId)check(s.id===b.sessionId,'This table session has changed.',409);
  o={id:uid(),number:t.orders.length+1,sessionId:s.id,status:'PENDING',version:1,createdAt:at(),updatedAt:at(),lines,key:b.key,createdByMemberId:m.id};
  t.orders.push(o);s.version++;event(t,m,action,b,{orderId:o.id,sessionId:s.id});result={id:o.id,sessionId:s.id};
 }else if(action==='cashier.edit'){
  check(o,'Order not found.',404);mutable(s,b);check(o.version===b.version,'This order changed. Refresh and review the latest version.',409);
  check(!t.payments.some(p=>p.sessionId===s.id),'Use an authorized refund for paid items.',409);
  check(['PENDING','ACCEPTED'].includes(o.status)&&!o.cancelledAt,'The kitchen has started this order. Add a new order instead.',409);
  check(!o.lines.some(l=>l.cancelledQuantity),'Add a new order after a cancellation; cancelled items must retain their history.',409);
  const lines=helpers.lines(t,b.lines,o.lines,s),candidate={...t,orders:t.orders.map(x=>x===o?{...o,lines}:x)};
  check(priceOrders(candidate.orders.filter(x=>x.sessionId===s.id),{...s,...receiptRates(t,s)}).total>=bill(t,s).paid,'Use an authorized refund for paid items.',409);
  event(t,m,action,b,{orderId:o.id,before:structuredClone(o.lines),after:structuredClone(lines)});o.lines=lines;o.version++;o.updatedAt=at();s.version++;
 }else if(action==='cashier.cancel'){
  check(o,'Order not found.',404);mutable(s,b);check(o.version===b.version&&!o.cancelledAt,'This order changed. Refresh and review the latest version.',409);reason(b);
  check(!t.payments.some(p=>p.sessionId===s.id),'Use an authorized refund for paid items.',409);
  const prepared=!['PENDING','ACCEPTED'].includes(o.status);if(prepared){requirePermission(m,'billing.void');requirePermission(m,'billing.approve_adjustment');}
  const ids=b.lineIds===undefined?o.lines.filter(l=>activeQuantity(l)>0).map(l=>l.id):b.lineIds;
  check(Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>o.lines.some(l=>l.id===id&&activeQuantity(l)>0)),'Select eligible order items.');
  for(const l of o.lines.filter(l=>ids.includes(l.id)))l.cancelledQuantity=l.quantity;
  if(o.lines.every(l=>!activeQuantity(l)))o.cancelledAt=at();
  o.version++;o.updatedAt=at();s.version++;event(t,m,action,b,{orderId:o.id,sessionId:s.id,lineIds:ids,prepared,notification:'Kitchen cancellation'});
 }else if(action==='cashier.reopen'){
  check(o,'Order not found.',404);mutable(s,b);reason(b);check(o.cancelledAt&&['PENDING','ACCEPTED'].includes(o.status)&&o.version===b.version&&!t.payments.some(p=>p.sessionId===s.id),'Only cancelled, unprepared, unpaid orders can be reopened.',409);
  for(const l of o.lines)delete l.cancelledQuantity;delete o.cancelledAt;o.version++;s.version++;o.updatedAt=at();event(t,m,action,b,{orderId:o.id});
 }else if(action==='billing.discount'||action==='billing.remove_discount'){
  mutable(s,b);reason(b);check(!t.payments.some(p=>p.sessionId===s.id),'Apply discounts before recording payments.',409);
  const discounts=structuredClone(s.discounts||[]);
  if(action==='billing.discount'){
   check(['percent','fixed'].includes(b.kind),'Choose percent or fixed discount.');amount(b.value);if(b.kind==='percent')check(b.value<=10000,'Discount percentage must be from 0 to 100.');
   const lines=t.orders.filter(o=>o.sessionId===s.id&&!o.cancelledAt).flatMap(o=>o.lines),line=b.lineId?lines.find(l=>l.id===b.lineId&&activeQuantity(l)>0):null;
   check(!b.lineId||line,'Order item not found.',404);
   const base=line?line.unitPrice*activeQuantity(line):bill(t,s).subtotal;
   check(base>0&&(b.kind!=='fixed'||b.value<=base),'Discount exceeds the eligible item or order amount.');
   const limit=m.discountLimitBps??0;
   if(b.kind==='percent'?b.value>limit:BigInt(b.value)*10000n>BigInt(limit)*BigInt(base))requirePermission(m,'billing.approve_adjustment');
   for(const d of discounts)if(!d.revokedAt&&(d.lineId||null)===(b.lineId||null))d.revokedAt=at();
   discounts.push({id:uid(),kind:b.kind,value:b.value,lineId:b.lineId||null,reason:b.reason.trim(),memberId:m.id,createdAt:at()});
  }else{const d=discounts.find(d=>d.id===b.discountId&&!d.revokedAt);check(d,'Discount not found.',404);d.revokedAt=at();}
  s.discounts=discounts;s.version++;event(t,m,action,b,{sessionId:s.id,discounts:structuredClone(discounts)});
 }else if(action==='billing.refund'||action==='billing.void'){
  requirePermission(m,'billing.approve_adjustment');version(s,b);reason(b);amount(b.amount);check(s.status==='FINALIZED','Finalize the bill before recording a credit or refund.',409);
  const current=bill(t,s),shift=paymentShift(t,m),existingCredits=t.pos.credits.filter(c=>c.sessionId===s.id).reduce((n,c)=>n+c.amount,0);
  check(b.amount<=current.total-existingCredits,'Adjustment exceeds the remaining bill value.',409);
  let payment;
  if(action==='billing.refund'){
   payment=t.payments.find(p=>p.id===b.paymentId&&p.sessionId===s.id);check(payment,'Original payment not found.',404);
   const refunded=t.pos.refunds.filter(r=>r.paymentId===payment.id).reduce((n,r)=>n+r.amount,0);
   check(b.amount<=payment.amount-refunded,'Refund exceeds the original payment remaining amount.',409);
   check(payment.method!=='card'||b.externalConfirmed===true&&typeof b.externalReference==='string'&&b.externalReference.trim().length>=3&&b.externalReference.length<=150,'Confirm the actual external card refund and provide its reference.');
   if(payment.method==='card')check(!t.pos.refunds.some(r=>r.method==='card'&&r.externalReference===b.externalReference.trim()),'This external refund reference was already recorded.',409);
   if(payment.method==='cash'&&shift)check(b.amount<=shiftSummary(t,shift).expectedCash,'Refund exceeds expected drawer cash.',409);
   const refund={id:uid(),sessionId:s.id,paymentId:payment.id,method:payment.method,amount:b.amount,reason:b.reason.trim(),memberId:m.id,shiftId:shift?.id||null,createdAt:at(),key:b.key,...(payment.method==='card'?{externalReference:b.externalReference.trim()}: {})};
   t.pos.refunds.push(refund);result={id:refund.id};
  }else{check(b.amount<=current.due,'Paid transactions require the refund workflow.',409);}
  const part=field=>roundedRatio(existingCredits+b.amount,s.finalBill[field]||0,current.total)-roundedRatio(existingCredits,s.finalBill[field]||0,current.total);
  const credit={id:uid(),sessionId:s.id,amount:b.amount,tax:part('tax'),service:part('service'),reason:b.reason.trim(),memberId:m.id,shiftId:shift?.id||null,createdAt:at(),refundId:result.id||null,key:b.key};
  t.pos.credits.push(credit);s.version++;event(t,m,action,b,{sessionId:s.id,amount:b.amount,paymentId:payment?.id,creditId:credit.id});
 }else if(action==='shift.open'){
  amount(b.openingCash,true);check(!activeShift(t,m),'You already have an open shift.',409);
  check(!t.pos.handovers.some(h=>h.status==='PENDING'&&h.toMemberId===m.id),'Confirm your pending handover before opening a shift.',409);
  const shift={id:uid(),memberId:m.id,openedAt:at(),openingCash:b.openingCash,status:'OPEN',collections:{cashPayments:0,cardPayments:0},key:b.key};t.pos.enabled=true;t.pos.shifts.push(shift);event(t,m,action,b,{shiftId:shift.id});result={id:shift.id};
 }else if(action==='shift.move'){
  const shift=ownShift(t,m,b.shiftId,true);check(shift.status==='OPEN','Shift is closed.',409);reason(b);amount(b.amount);check(['in','out'].includes(b.kind),'Choose cash in or cash out.');
  requirePermission(m,'shifts.supervise');if(b.kind==='out')check(b.amount<=shiftSummary(t,shift).expectedCash,'Cash out exceeds expected drawer cash.',409);
  const move={id:uid(),shiftId:shift.id,kind:b.kind,amount:b.amount,reason:b.reason.trim(),memberId:m.id,createdAt:at(),key:b.key};t.pos.movements.push(move);event(t,m,action,b,move);
 }else if(action==='shift.close'){
  const shift=ownShift(t,m,b.shiftId,true);check(shift.status==='OPEN','Shift is already closed.',409);amount(b.actualCash,true);reason(b);
  shift.actualCash=b.actualCash;shift.closedAt=at();shift.closedByMemberId=m.id;shift.status='CLOSED';event(t,m,action,b,shiftSummary(t,shift));result=shiftSummary(t,shift);
 }else if(action==='handover.declare'){
  const shift=ownShift(t,m,b.shiftId);check(shift.status==='CLOSED','Close and count the shift before handover.',409);amount(b.amount,true);reason(b);
  check(!t.pos.handovers.some(h=>h.shiftId===shift.id),'A handover already exists for this shift.',409);
  const recipient=t.members.find(x=>x.id===b.toMemberId&&x.active&&x.id!==m.id&&x.permissions.includes('shifts.manage'));check(recipient,'Choose another active cashier or manager.');
  check(b.amount<=shift.actualCash,'Transferred cash exceeds the counted drawer balance.',409);
  check(!activeShift(t,recipient)&&!t.pos.handovers.some(h=>h.toMemberId===recipient.id&&h.status==='PENDING'),'Recipient must close their shift and resolve pending handovers first.',409);
  const handover={id:uid(),shiftId:shift.id,fromMemberId:m.id,toMemberId:recipient.id,declaredCash:b.amount,declaredAt:at(),reason:b.reason.trim(),status:'PENDING',key:b.key};t.pos.handovers.push(handover);event(t,m,action,b,{handoverId:handover.id});result={id:handover.id};
 }else if(action==='handover.confirm'){
  const handover=t.pos.handovers.find(h=>h.id===b.handoverId);check(handover,'Handover not found.',404);check(handover.toMemberId===m.id,'Only the named recipient can confirm receipt.',403);check(handover.status==='PENDING','Handover was already confirmed.',409);amount(b.receivedCash,true);reason(b);check(!activeShift(t,m),'Close your current shift before confirming a handover.',409);
  const shift={id:uid(),memberId:m.id,openedAt:at(),openingCash:b.receivedCash,status:'OPEN',collections:{cashPayments:0,cardPayments:0},handoverId:handover.id,key:b.key};
  Object.assign(handover,{status:'CONFIRMED',receivedCash:b.receivedCash,discrepancy:b.receivedCash-handover.declaredCash,confirmedAt:at(),confirmedByMemberId:m.id,confirmationReason:b.reason.trim(),incomingShiftId:shift.id});t.pos.shifts.push(shift);t.pos.enabled=true;event(t,m,action,b,{handoverId:handover.id,discrepancy:handover.discrepancy});result={id:shift.id};
 }
 return op.save(result);
}
