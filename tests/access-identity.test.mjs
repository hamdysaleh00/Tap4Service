import test from 'node:test';
import assert from 'node:assert/strict';
import { accessIdentity } from '../lib/access-identity.mjs';
const options={TAP2SERVE_ACCESS_ISSUER:'https://team.cloudflareaccess.com',TAP2SERVE_ACCESS_AUDIENCE:'staff,admin'};
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'key-1',alg:'RS256',use:'sig'};
const fetchKeys=async url=>{assert.equal(url,options.TAP2SERVE_ACCESS_ISSUER+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
async function token(overrides={},header={alg:'RS256',kid:'key-1'}){
 const claims={iss:options.TAP2SERVE_ACCESS_ISSUER,aud:['staff'],sub:'stable-id',email:'staff@example.test',iat:Math.floor(Date.now()/1000)-5,exp:Math.floor(Date.now()/1000)+60,...overrides};
 const prefix=[header,claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(prefix));
 return `${prefix}.${Buffer.from(signature).toString('base64url')}`;
}
test('verified Access signature supplies stable identity; multiple configured audiences supported',async()=>{
 assert.equal((await accessIdentity(await token(),options,fetchKeys)).userId,'stable-id');
 assert.equal((await accessIdentity(await token({aud:['admin']}),options,fetchKeys)).email,'staff@example.test');
});
test('expired, premature, wrong issuer/audience, malformed, unsigned and tampered identities fail closed',async()=>{
 for(const claims of [{exp:0},{exp:'9999999999'},{iat:Date.now()},{nbf:Date.now()},{iss:'https://evil.example'},{aud:['foreign']},{aud:'staff'},{sub:''},{email:null}])assert.equal(await accessIdentity(await token(claims),options,fetchKeys),null);
 for(const header of [{alg:'none',kid:'key-1'},{alg:'HS256',kid:'key-1'},{alg:'RS256',kid:'unknown'}])assert.equal(await accessIdentity(await token({},header),options,fetchKeys),null);
 const signed=await token();const parts=signed.split('.');parts[1]=Buffer.from(JSON.stringify({sub:'forged'})).toString('base64url');assert.equal(await accessIdentity(parts.join('.'),options,fetchKeys),null);
 for(const value of [null,'fake','a.b.c','a'.repeat(17000)])assert.equal(await accessIdentity(value,options,fetchKeys),null);
 assert.equal(await accessIdentity(signed,{},fetchKeys),null);
 assert.equal(await accessIdentity(signed,{...options,TAP2SERVE_ACCESS_ISSUER:'http://localhost'},fetchKeys),null);
 assert.equal(await accessIdentity(signed,options,async()=>{throw new Error('offline');}),null);
});
