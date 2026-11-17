import { scrypt, timingSafeEqual } from 'node:crypto';
import { AppError } from './domain.mjs';

const encoder=new TextEncoder();
export const randomToken=(bytes=32)=>Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString('base64url');
export const tokenHash=async token=>Buffer.from(await crypto.subtle.digest('SHA-256',encoder.encode(token))).toString('hex');
export function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
export function validatePassword(password){
 if(typeof password!=='string'||[...password].length<15||encoder.encode(password).length>1024)throw new Error('Use a password of at least 15 characters and at most 1024 UTF-8 bytes.');
}
// Keep the password KDF cost unchanged, while bounding concurrent memory use
// within a 128 MB Workers isolate. Excess attempts retry, rather than queueing.
let activeDerivations=0;
const derive=async(password,salt)=>{
 if(activeDerivations>=2)throw new AppError('Authentication is busy. Try again shortly.',503);
 activeDerivations++;
 try{return await new Promise((resolve,reject)=>scrypt(password,salt,32,{N:16384,r:8,p:5,maxmem:32*1024*1024},(e,key)=>e?reject(e):resolve(key)));}finally{activeDerivations--;}
};
export async function hashPassword(password){validatePassword(password);const salt=randomToken(16),key=await derive(password,salt);return `$scrypt$v1$16384$8$5$${salt}$${key.toString('base64url')}`;}
export async function verifyPassword(password,encoded){
 const parts=typeof encoded==='string'?encoded.split('$'):[];
 const valid=parts.length===8&&parts.slice(0,6).join('$')==='$scrypt$v1$16384$8$5'&&/^[\w-]{22}$/.test(parts[6])&&/^[\w-]{43}$/.test(parts[7]);
 const bounded=typeof password==='string'&&encoder.encode(password).length<=1024;
 // Absent/disabled accounts incur the same KDF work; no fixed dummy password.
 const result=await derive(bounded?password:'',valid?parts[6]:randomToken(16));
 return bounded&&valid&&equal(result.toString('base64url'),parts[7]);
}
export async function rateKey(secret,value){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Buffer.from(await crypto.subtle.sign('HMAC',key,encoder.encode(value))).toString('hex');}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret(){return [...crypto.getRandomValues(new Uint8Array(32))].map(v=>alphabet[v&31]).join('');}
function base32(value){let bits='';for(const c of value){const index=alphabet.indexOf(c);if(index<0)throw new Error('Invalid MFA key.');bits+=index.toString(2).padStart(5,'0');}return Uint8Array.from(bits.match(/.{8}/g).map(s=>parseInt(s,2)));}
export async function totp(secret,step){
 const key=await crypto.subtle.importKey('raw',base32(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']),counter=new ArrayBuffer(8);new DataView(counter).setBigUint64(0,BigInt(step));
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,counter)),offset=bytes.at(-1)&15;const number=((bytes[offset]&127)<<24)|(bytes[offset+1]<<16)|(bytes[offset+2]<<8)|bytes[offset+3];return String(number%1000000).padStart(6,'0');
}
export async function checkTotp(secret,code,time,lastStep=-1){
 if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;
 const current=Math.floor(time/30000);let match=null;
 for(const step of [current-1,current,current+1])if(equal(await totp(secret,step),code)&&step>lastStep)match=step;
 return match;
}
async function encryptionKey(secret){const bytes=Buffer.from(secret??'','base64');if(bytes.length!==32)throw new Error('MFA encryption key must contain 32 random bytes encoded as base64.');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
export async function encryptMfa(secret,keyMaterial,userId){const iv=crypto.getRandomValues(new Uint8Array(12)),key=await encryptionKey(keyMaterial),data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(userId)},key,encoder.encode(secret));return Buffer.from(iv).toString('base64url')+'.'+Buffer.from(data).toString('base64url');}
export async function decryptMfa(value,keyMaterial,userId){const [iv,data]=value.split('.'),key=await encryptionKey(keyMaterial);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(iv,'base64url'),additionalData:encoder.encode(userId)},key,Buffer.from(data,'base64url')));}
