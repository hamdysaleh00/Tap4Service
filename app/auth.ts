import { authService,independentAuth } from '../lib/auth-server';
import { getChatGPTUser } from './chatgpt-auth';
export async function authenticatedUser(request:Request,mutation=false,sensitive=false){
 if(independentAuth()){
  const service=await authService(request);
  if(mutation)return (await service.requireSession(request,{csrf:true,recent:sensitive})).user;
  return (await service.authenticate(request))?.user??null;
 }
 const identity=await getChatGPTUser();return identity?{id:identity.userId,email:identity.email,name:identity.displayName}:null;
}
