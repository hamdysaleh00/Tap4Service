import { activeQuantity } from './bill-pricing.mjs';
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
const modifier=value=>pick(value,['id','name','nameAr','price']);
export const publicMenu=items=>items.filter(item=>item.visible).map(item=>({...pick(item,['id','name','nameAr','description','descriptionAr','price','category','image','available','visible']),modifiers:item.modifiers.map(modifier)}));
export const publicOrders=orders=>orders.filter(o=>!o.cancelledAt).map(order=>({...pick(order,['id','number','sessionId','status','version','createdAt','updatedAt']),...(order.lines.some(l=>l.cancelledQuantity)?{adjusted:true}:{}),lines:order.lines.filter(l=>activeQuantity(l)>0).map(line=>({...pick(line,['id','itemId','name','nameAr','basePrice','unitPrice','notes']),quantity:activeQuantity(line),modifiers:line.modifiers.map(modifier)}))}));
