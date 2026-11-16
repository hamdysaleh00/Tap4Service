import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createAuthService } from '../lib/auth-service.mjs';
import { hashPassword,verifyPassword,randomToken,tokenHash,totp,newTotpSecret,encryptMfa,decryptMfa } from '../lib/auth-crypto.mjs';
import { createInitialState,createRestaurant,applyCommand,actor,staffView,AppError } from '../lib/domain.mjs';
import { prepareAuth,newWorkspaceSource } from '../scripts/prepare-auth.mjs';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { cleanupAuth } from '../lib/auth-maintenance.mjs';
import { readAuthBody } from '../lib/auth-body.mjs';

const schema=readFileSync(new URL('../db/staged/0002_auth.sql',import.meta.url),'utf8'),origin='https://olive.tap2serve.com';
async function fixture({superAdmin=false}={}){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(schema);db.exec("INSERT INTO auth_config VALUES('main',1,1)");
 let time=Date.parse('2026-11-16T12:00:00Z');const password=randomToken(),owner={id:'owner',email:'owner@example.test',name:'Owner'},state=createInitialState(owner),t=state.restaurants[0],other=createRestaurant('Other');state.restaurants.push(other);
 const secret=superAdmin?newTotpSecret():null,key=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'),emails=[],background=[];
 db.prepare('INSERT INTO users VALUES(?)').run(owner.id);db.prepare('INSERT INTO auth_accounts(user_id,email,display_name,password_hash,is_super_admin,email_verified_at,mfa_secret_enc,created_at) VALUES(?,?,?,?,?,?,?,?)').run(owner.id,owner.email,owner.name,await hashPassword(password),Number(superAdmin),time,secret?await encryptMfa(secret,key,owner.id):null,time);
 const options={origin,rateSecret:randomToken(),mfaKey:key,now:()=>time,async sendEmail(message){emails.push(message);},async authorizeInvitation(user,rid,mid){const {t,m}=actor(state,user,rid);if(!m.permissions.includes('staff.manage')||!m.permissions.includes('permissions.manage'))throw new AppError('Denied',403);const member=t.members.find(m=>m.id===mid&&m.active);if(!member)throw new AppError('Not found',404);return member;}};
 const adapter=sqliteD1(db),service=createAuthService(adapter,options);
 const request=(path='/api/auth/login',{cookie='',csrf='',headers={},method='POST'}={})=>new Request(origin+path,{method,headers:{origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...headers}});
 const login=async()=>service.login(request(),{email:owner.email,password,...(secret?{code:await totp(secret,Math.floor(time/30000))}:{})});
 const sessionRequest=(session,path='/api/command')=>request(path,{cookie:session.cookie.split(';')[0],csrf:session.csrf});
 return {db,adapter,service,options,request,login,sessionRequest,password,owner,state,t,other,secret,key,emails,background,get time(){return time;},advance(ms){time+=ms;}};
}
test('password hashes use random salts and the fixed memory-hard KDF; Unicode and bounds are enforced',async()=>{
 const password=randomToken()+' مطعم',a=await hashPassword(password),b=await hashPassword(password);assert.notEqual(a,b);assert.match(a,/^\$scrypt\$v1\$16384\$8\$5\$/);assert(await verifyPassword(password,a));assert.equal(await verifyPassword(password+'x',a),false);assert.equal(await verifyPassword(password,null),false);await assert.rejects(hashPassword('short'));await assert.rejects(hashPassword('😀'.repeat(300)));assert.equal(await verifyPassword(password,a.replace('$16384$','$999999999$')),false);
});
test('TOTP matches the published RFC 6238 test vector',async()=>{assert.equal(await totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',1),'287082');});
test('authentication bodies are byte-bounded before buffering, with strict JSON media and UTF-8 validation',async()=>{
 const request=(body,type='application/json')=>new Request(origin+'/api/auth/login',{method:'POST',headers:{'content-type':type},body});
 assert.deepEqual(await readAuthBody(request('{"email":"staff@example.test"}')),{email:'staff@example.test'});
 await assert.rejects(readAuthBody(request('x'.repeat(8193))),e=>e.status===413);await assert.rejects(readAuthBody(request('{}','text/plain')),e=>e.status===415);await assert.rejects(readAuthBody(request('[]')),e=>e.status===400);await assert.rejects(readAuthBody(request(new Uint8Array([255,254]))),e=>e.status===400);
});
test('login ignores identity headers, rotates opaque cookies, stores only digests and requires CSRF',async()=>{
 const f=await fixture();assert.equal(await f.service.authenticate(f.request('/api/state',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':f.owner.email}})),null);
 const session=await f.login();assert.match(session.cookie,/^__Host-t2s_session=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800$/);
 const row=f.db.prepare('SELECT * FROM auth_sessions').get(),raw=session.cookie.split(';')[0].split('=')[1];assert.notEqual(row.token_hash,raw);assert.equal(row.token_hash,await tokenHash(raw));
 const request=f.sessionRequest(session),auth=await f.service.requireSession(request,{csrf:true});assert.equal(auth.user.id,f.owner.id);assert.equal(auth.user.authProvider,'independent');assert.equal(auth.user.isSuperAdmin,false);
 await assert.rejects(f.service.requireSession(f.request('/api/command',{cookie:session.cookie.split(';')[0]}),{csrf:true}),e=>e.status===403);
 await assert.rejects(f.service.login(f.request('',{headers:{origin:'https://evil.example'}}),{email:f.owner.email,password:f.password}),e=>e.status===403);
 const replacement=await f.service.login(f.sessionRequest(session),{email:f.owner.email,password:f.password});assert.notEqual(replacement.cookie,session.cookie);assert.equal(await f.service.authenticate(request),null);
});
test('sessions expire, revoke on logout/account disable, and cannot be replayed on another origin',async()=>{
 const f=await fixture(),s=await f.login(),req=f.sessionRequest(s);
 const otherOrigin=createAuthService(f.adapter,{...f.options,origin:'https://other.tap2serve.com'});assert.equal(await otherOrigin.authenticate(new Request('https://other.tap2serve.com/api/state',{headers:{cookie:s.cookie.split(';')[0]}})),null);
 f.advance(31*60*1000);assert.equal(await f.service.authenticate(req),null);
 const s2=await f.login();await f.service.logout(f.sessionRequest(s2));assert.equal(await f.service.authenticate(f.sessionRequest(s2)),null);
 const s3=await f.login();f.db.prepare('UPDATE auth_accounts SET active=0').run();assert.equal(await f.service.authenticate(f.sessionRequest(s3)),null);
});
test('MFA is mandatory for Super Admin, TOTP counters are single use under concurrent login, and keys are encrypted',async()=>{
 const f=await fixture({superAdmin:true}),stored=f.db.prepare('SELECT mfa_secret_enc FROM auth_accounts').get();assert(!stored.mfa_secret_enc.includes(f.secret));assert.equal(await decryptMfa(stored.mfa_secret_enc,f.key,f.owner.id),f.secret);await assert.rejects(decryptMfa(stored.mfa_secret_enc,f.key,'wrong-user'));
 await assert.rejects(f.service.login(f.request(),{email:f.owner.email,password:f.password}),e=>e.status===401);
 const code=await totp(f.secret,Math.floor(f.time/30000)),race=await Promise.allSettled([f.service.login(f.request(),{email:f.owner.email,password:f.password,code}),f.service.login(f.request(),{email:f.owner.email,password:f.password,code})]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 await assert.rejects(f.service.login(f.request(),{email:f.owner.email,password:f.password,code}));f.advance(31000);const next=await f.login();assert((await f.service.authenticate(f.sessionRequest(next))).user.isSuperAdmin);
});
test('first normal user cannot become platform admin; source owner without explicit independent role is denied',async()=>{
 const f=await fixture(),session=await f.login(),user=(await f.service.authenticate(f.sessionRequest(session))).user;
 assert.equal(staffView(f.state,user,f.t.id).platform,false);assert.throws(()=>applyCommand(f.state,user,{action:'platform.create',name:'Privilege escalation'}),e=>e.status===403);
 assert.throws(()=>applyCommand(f.state,{...user,id:'attacker',isSuperAdmin:true},{action:'platform.create',name:'Privilege escalation'}),e=>e.status===403);
 await assert.rejects(f.service.disableAccount(f.sessionRequest(session),{userId:'other'}),e=>e.status===403);
});
test('only an explicit recently authenticated Super Admin can disable another login',async()=>{
 const f=await fixture({superAdmin:true}),session=await f.login();await assert.rejects(f.service.disableAccount(f.sessionRequest(session),{userId:f.owner.id}),e=>e.status===400);
 f.db.prepare('INSERT INTO users VALUES(?)').run('staff-target');f.db.prepare('INSERT INTO auth_accounts(user_id,email,display_name,created_at) VALUES(?,?,?,?)').run('staff-target','staff@example.test','Staff',f.time);
 await f.service.disableAccount(f.sessionRequest(session),{userId:'staff-target'});assert.equal(f.db.prepare("SELECT active FROM auth_accounts WHERE user_id='staff-target'").get().active,0);
 f.advance(6*60*1000);await assert.rejects(f.service.disableAccount(f.sessionRequest(session),{userId:'staff-target'}),e=>e.status===403);
});
test('invitation authorization uses stored membership; cross-tenant and guessed IDs are denied without issuing mail',async()=>{
 const f=await fixture(),session=await f.login();applyCommand(f.state,f.owner,{action:'staff.save',restaurantId:f.t.id,email:'chef@example.test',name:'Chef',permissions:['kitchen.read']});const member=f.t.members.at(-1);
 await assert.rejects(f.service.invitation(f.sessionRequest(session),{restaurantId:f.other.id,memberId:member.id,email:'attacker@example.test',userId:f.owner.id}),e=>e.status===403);assert.equal(f.emails.length,0);
 await f.service.invitation(f.sessionRequest(session),{restaurantId:f.t.id,memberId:member.id,email:'attacker@example.test',userId:f.owner.id});assert.equal(f.emails[0].to,member.email);const account=f.db.prepare('SELECT * FROM auth_accounts WHERE email=?').get(member.email);assert.equal(account.is_super_admin,0);assert.equal(account.password_hash,null);
 const token=new URL(f.emails[0].text.match(/https:\/\/\S+/)[0]).hash.slice('#token='.length);assert.equal(f.db.prepare('SELECT token_hash FROM auth_action_tokens').get().token_hash,await tokenHash(token));
 const result=await f.service.activate(f.request(),{token,password:randomToken()});assert(result.ok);await assert.rejects(f.service.activate(f.request(),{token,password:randomToken()}));
 assert(!JSON.stringify(f.db.prepare('SELECT * FROM auth_events').all()).includes(token));
});
test('recovery is generic; one-use reset revokes all sessions and keeps MFA; mail failures leak no token',async()=>{
 const f=await fixture(),session=await f.login(),known=await f.service.recovery(f.request(),{email:f.owner.email}),unknown=await f.service.recovery(f.request(),{email:'unknown@example.test'});assert.deepEqual(known,unknown);const token=new URL(f.emails[0].text.match(/https:\/\/\S+/)[0]).hash.slice(7),newPassword=randomToken();
 const race=await Promise.allSettled([f.service.activate(f.request(),{token,password:newPassword}),f.service.activate(f.request(),{token,password:randomToken()})]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(await f.service.authenticate(f.sessionRequest(session)),null);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n,0);
 const failing=createAuthService(f.adapter,{...f.options,sendEmail:async()=>{throw new Error('provider secret should never escape');}});assert.deepEqual(await failing.recovery(f.request(),{email:f.owner.email}),known);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM auth_action_tokens WHERE used_at IS NULL').get().n,0);
});
test('email/IP attempts are atomically limited and sensitive changes require recent login',async()=>{
 const f=await fixture(),s=await f.login();f.advance(6*60*1000);await assert.rejects(f.service.invitation(f.sessionRequest(s),{restaurantId:f.t.id,memberId:'missing'}),e=>e.status===403);
 f.db.prepare('UPDATE auth_rate_buckets SET count=10').run();await assert.rejects(f.service.login(f.request(),{email:f.owner.email,password:f.password}),e=>e.status===429);
 const disabled=createAuthService(f.adapter,{...f.options,rateSecret:''});await assert.rejects(disabled.authenticate(f.request()),e=>e.status===503);
});
test('password changes require the current credential, revoke all sessions, and block stale sessions',async()=>{
 const f=await fixture(),s=await f.login();await assert.rejects(f.service.changePassword(f.sessionRequest(s),{currentPassword:randomToken(),password:randomToken()}),e=>e.status===401);
 const password=randomToken();await f.service.changePassword(f.sessionRequest(s),{currentPassword:f.password,password});assert.equal(await f.service.authenticate(f.sessionRequest(s)),null);assert(await verifyPassword(password,f.db.prepare('SELECT password_hash FROM auth_accounts').get().password_hash));
});
test('explicit offline provisioning retains identity IDs, rejects ambiguous owners and never contains a password or raw token in SQL',async()=>{
 const owner={id:'old-owner',email:'owner@example.test'},state=createInitialState(owner),source={id:'main',revision:5,payload:JSON.stringify(state)},config={storage:'legacy',accounts:[{userId:owner.id,email:owner.email,superAdmin:true,origin:'https://admin.tap2serve.com'}]};
 const prepared=await prepareAuth(source,config),raw=new URL(prepared.links[0].url).hash.slice(7);assert(!prepared.sql.includes(raw));assert(!prepared.sql.includes('password_hash'));assert(prepared.sql.includes(owner.id));assert.equal(prepared.report.ready,false);
 const db=new DatabaseSync(':memory:');db.exec(schema);db.exec('CREATE TABLE app_state(id TEXT PRIMARY KEY,revision INTEGER,payload TEXT)');db.prepare('INSERT INTO app_state VALUES(?,?,?)').run(source.id,source.revision,source.payload);db.exec('BEGIN');db.exec(prepared.sql);db.exec('COMMIT');assert.equal(db.prepare('SELECT ready FROM auth_config').get().ready,0);assert.equal(db.prepare('SELECT payload FROM app_state').get().payload,source.payload);
 await assert.rejects(prepareAuth(source,{...config,accounts:[{...config.accounts[0],userId:'attacker'}]}));await assert.rejects(prepareAuth(source,{...config,accounts:[{...config.accounts[0],superAdmin:false}]}));
});
test('new workspace preparation requires a named explicit owner and starts without sample tenants or public registration',async()=>{
 const config={storage:'legacy',accounts:[{userId:crypto.randomUUID(),email:'new-owner@example.test',superAdmin:true,origin:'https://admin.tap2serve.com'}]},source=newWorkspaceSource(config),state=JSON.parse(source.payload);assert.equal(state.platformOwner,config.accounts[0].userId);assert.deepEqual(state.restaurants,[]);assert.equal((await prepareAuth(source,config)).report.ready,false);assert.throws(()=>newWorkspaceSource({...config,accounts:[]}));
});
test('scheduled cleanup removes expired authentication material while retaining active sessions and all audit events',async()=>{
 const f=await fixture();await f.login();const before=f.db.prepare('SELECT COUNT(*) AS n FROM auth_events').get().n;f.db.prepare('INSERT INTO auth_rate_buckets VALUES(?,?,?)').run('expired',1,f.time-1);assert.equal(await cleanupAuth(f.adapter,f.time),1);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n,1);f.advance(31*60*1000);await cleanupAuth(f.adapter,f.time);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM auth_events').get().n,before);
});
