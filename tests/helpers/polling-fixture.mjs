import { createInitialState,createRestaurant,PERMISSIONS } from '../../lib/domain.mjs';
export const pollingOwner={id:'polling-owner',email:'polling@example.test',name:'Polling Owner'};
export function pollingFixture({restaurants=3,history=200}={}){
 const state=createInitialState(pollingOwner);
 for(let n=1;n<restaurants;n++){const t=createRestaurant('Other '+n,true);t.members.push({id:crypto.randomUUID(),userId:pollingOwner.id,email:pollingOwner.email,name:pollingOwner.name,permissions:[...PERMISSIONS],active:true});state.restaurants.push(t);}
 for(const t of state.restaurants)for(let i=0;i<history;i++){
  const id=crypto.randomUUID(),at='2020-01-01T00:00:00.000Z';
  t.sessions.push({id,tableId:t.tables[0].id,status:'FINALIZED',version:3,capability:'',openedAt:at,openedBy:'Owner',releasedAt:at,closedAt:at,taxBps:0,serviceBps:0,finalBill:{subtotal:100,service:0,tax:0,total:100}});
  t.orders.push({id:crypto.randomUUID(),number:t.orders.length+1,sessionId:id,status:'SERVED',version:3,createdAt:at,updatedAt:at,key:crypto.randomUUID(),lines:[{id:crypto.randomUUID(),itemId:t.menu[0].id,name:'Historical item',quantity:1,unitPrice:100,basePrice:100,notes:'',modifiers:[]}]});
  t.payments.push({id:crypto.randomUUID(),sessionId:id,key:crypto.randomUUID(),amount:100,method:'cash',createdAt:at,by:'Owner'});
 }
 return state;
}
