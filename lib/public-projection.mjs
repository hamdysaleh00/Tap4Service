const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
const modifier=value=>pick(value,['id','name','nameAr','price']);
export const publicMenu=items=>items.filter(item=>item.visible).map(item=>({...pick(item,['id','name','nameAr','description','descriptionAr','price','category','image','available','visible']),modifiers:item.modifiers.map(modifier)}));
export const publicOrders=orders=>orders.map(order=>({...pick(order,['id','number','sessionId','status','version','createdAt','updatedAt']),lines:order.lines.map(line=>({...pick(line,['id','itemId','name','nameAr','basePrice','unitPrice','quantity','notes']),modifiers:line.modifiers.map(modifier)}))}));
