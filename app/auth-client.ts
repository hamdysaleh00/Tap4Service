'use client';
export async function securityHeaders():Promise<Record<string,string>>{
 const response=await fetch('/api/auth/session',{cache:'no-store',credentials:'same-origin'});
 const data=await response.json() as {error?:string;independent?:boolean;csrf?:string};
 if(!response.ok)throw new Error(data.error||'Staff sign-in required.');
 if(data.independent&&!data.csrf)throw new Error('Staff sign-in required.');
 return data.independent?{'X-CSRF-Token':data.csrf!}:{};
}
