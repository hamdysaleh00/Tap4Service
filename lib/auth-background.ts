import { AsyncLocalStorage } from 'node:async_hooks';
const context=new AsyncLocalStorage<{waitUntil:(task:Promise<unknown>)=>void}>();
export const withAuthBackground=<T>(ctx:{waitUntil:(task:Promise<unknown>)=>void},fn:()=>T)=>context.run(ctx,fn);
export function authBackground(task:Promise<unknown>){const ctx=context.getStore();if(!ctx)throw new Error('Request context unavailable.');ctx.waitUntil(task.catch(()=>{}));}
