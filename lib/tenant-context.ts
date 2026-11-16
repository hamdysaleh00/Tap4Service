import { AsyncLocalStorage } from 'node:async_hooks';
export type TenantScope={kind:string;base:string;hostname:string;origin?:string;slug?:string;restaurantId?:string};
const context=new AsyncLocalStorage<TenantScope>();
export const withTenantScope=<T>(scope:TenantScope,fn:()=>T)=>context.run(scope,fn);
export const currentTenantScope=()=>context.getStore();
