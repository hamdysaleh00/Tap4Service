import { AppError } from './domain.mjs';
export async function readAuthBody(request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))throw new AppError('JSON request required.',415);
 if(Number(request.headers.get('content-length')??0)>8192)throw new AppError('Request too large.',413);
 if(!request.body)throw new AppError('Invalid request.');
 const reader=request.body.getReader(),chunks=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new AppError('Request too large.',413);}chunks.push(value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body;}catch{throw new AppError('Invalid request.');}
}
