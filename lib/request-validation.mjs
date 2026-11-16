import { AppError } from './domain.mjs';
export async function readJsonBody(request,limit=64000){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))throw new AppError('JSON request required.',415);
 if(request.headers.has('content-encoding')&&!['identity',''].includes(request.headers.get('content-encoding')))throw new AppError('Invalid request.',415);
 const length=request.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>limit))throw new AppError('Request too large.',413);
 if(!request.body)throw new AppError('Invalid request.');
 const reader=request.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new AppError('Request too large.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new AppError('Invalid request.');}
 if(!body||typeof body!=='object'||Array.isArray(body))throw new AppError('Invalid request.');
 // Bound nested object work and deny prototype-shaped input before domain code.
 const pending=[[body,0]];let count=0;while(pending.length){const [value,depth]=pending.pop();if(++count>3000||depth>12)throw new AppError('Invalid request.');if(value&&typeof value==='object'){for(const [key,child] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw new AppError('Invalid request.');if(child&&typeof child==='object')pending.push([child,depth+1]);}}}
 return body;
}
export const validOpaque=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{16,150}$/.test(value);
export function validateGuestRead(url,capability){
 const tokens=url.searchParams.getAll('table'),sessions=url.searchParams.getAll('session');
 if(tokens.length!==1||!validOpaque(tokens[0])||sessions.length>1||(sessions.length===1&&!validOpaque(sessions[0]))||(capability!==null&&capability!==undefined&&!validOpaque(capability))||(capability&&sessions[0]&&capability!==sessions[0]))throw new AppError('This table link is not available.',404);
}
export function validateCommand(body){
 if(typeof body.action!=='string'||!/^([a-z]+\.){1,2}[a-z_]+$/.test(body.action)||body.action.length>80)throw new AppError('Invalid request.');
 if(body.action.startsWith('guest.')){
  if(!['guest.order','guest.edit','guest.bill','guest.call','guest.feedback'].includes(body.action))throw new AppError('Unknown guest action.');
  if(!validOpaque(body.token)||!validOpaque(body.capability))throw new AppError('This table session has ended. Ask staff to open a new session.',409);
  if(['guest.order','guest.edit','guest.feedback'].includes(body.action)&&!validOpaque(body.key))throw new AppError('A request identifier is required.');
 }
 if(body.key!==undefined&&!validOpaque(body.key))throw new AppError('A request identifier is required.');
 if(body.lines!==undefined){
  if(!Array.isArray(body.lines)||body.lines.length<1||body.lines.length>40)throw new AppError('Choose between 1 and 40 items.');
  for(const line of body.lines){if(!line||typeof line!=='object'||Array.isArray(line)||typeof line.itemId!=='string'||line.itemId.length>100||!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>30||line.notes!==undefined&&(typeof line.notes!=='string'||line.notes.length>500)||line.modifierIds!==undefined&&(!Array.isArray(line.modifierIds)||line.modifierIds.length>10||line.modifierIds.some(id=>typeof id!=='string'||id.length>100)))throw new AppError('Invalid request.');}
 }
 if(body.action==='guest.feedback'&&(body.comment!==undefined&&(typeof body.comment!=='string'||body.comment.length>1500)))throw new AppError('Invalid request.');
}
