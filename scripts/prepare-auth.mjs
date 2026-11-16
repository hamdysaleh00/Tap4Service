// Offline preparation only. No credentials, network clients or deployment APIs.
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseSnapshot,hash } from '../lib/normalized-migration.mjs';
import { normalizeEmail } from '../lib/auth-service.mjs';
import { randomToken,tokenHash } from '../lib/auth-crypto.mjs';
const quote=v=>typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
export function newWorkspaceSource(config,time=Date.now()){
 const admins=config.accounts?.filter(a=>a.superAdmin===true);
 if(admins?.length!==1||typeof admins[0].userId!=='string'||!admins[0].userId)throw new Error('An explicit Super Admin identity is required for a new workspace.');
 return {id:'main',revision:0,payload:JSON.stringify({platformOwner:admins[0].userId,restaurants:[],platformAudit:[],createdAt:new Date(time).toISOString(),sessionLifecycleVersion:1})};
}
export async function prepareAuth(source,config,time=Date.now()){
 const {row,state}=parseSnapshot(source);
 if(!['legacy','normalized'].includes(config.storage)||!Array.isArray(config.accounts))throw new Error('Specify storage and an explicit accounts list.');
 const ids=new Set(),emails=new Set(),rows=[],links=[];
 for(const account of config.accounts){
  const {userId,origin}=account,email=normalizeEmail(account.email);
  const url=new URL(origin);if(url.origin!==origin||url.protocol!=='https:')throw new Error('Each activation origin must be an exact reviewed HTTPS origin.');
  if(typeof userId!=='string'||!userId||ids.has(userId)||emails.has(email)||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Account IDs and canonical emails must be explicit and unique.');ids.add(userId);emails.add(email);
  const bound=state.restaurants.flatMap(t=>t.members).filter(m=>m.userId===userId),sameEmail=state.restaurants.flatMap(t=>t.members).filter(m=>normalizeEmail(m.email)===email&&m.userId);
  if(userId!==state.platformOwner&&!bound.length)throw new Error('The mapped identity must exist in the source. New staff use verified invitations.');
  if(bound.some(m=>normalizeEmail(m.email)!==email)||sameEmail.some(m=>m.userId!==userId))throw new Error('Conflicting legacy identities require an explicit reviewed reconciliation.');
  if(account.superAdmin===true&&userId!==state.platformOwner)throw new Error('Super Admin must explicitly match the retained platform owner.');
  const raw=randomToken(),digest=await tokenHash(raw);
  rows.push({userId,email,name:String(account.name||email).slice(0,100),superAdmin:account.superAdmin===true,origin,hash:digest});
  links.push({email,url:`${origin}/activate#token=${raw}`,expiresAt:new Date(time+60*60*1000).toISOString()});
 }
 if(rows.filter(r=>r.superAdmin).length!==1)throw new Error('Exactly one explicit Super Admin is required.');
 const owner=rows.find(r=>r.superAdmin),sourceHash=hash(row.payload);
 const sourceCheck=config.storage==='legacy'?`SELECT revision=${row.revision} AND json_extract(payload,'$.platformOwner')=${quote(state.platformOwner)} FROM app_state WHERE id='main'`:`SELECT owner_id=${quote(state.platformOwner)} AND EXISTS(SELECT 1 FROM migration_runs WHERE source_hash=${quote(sourceHash)} AND source_revision=${row.revision} AND verified=1) FROM platform_config WHERE id='main'`;
 const sql=["-- STAGING ONLY. Refuses an initialized auth store; no existing platform data is replaced.",`INSERT INTO auth_guards(id,valid) VALUES('provision',COALESCE((${sourceCheck}),0));`,"INSERT INTO auth_guards(id,valid) VALUES('empty',CASE WHEN NOT EXISTS(SELECT 1 FROM auth_config) AND NOT EXISTS(SELECT 1 FROM auth_accounts) THEN 1 ELSE 0 END);","INSERT INTO auth_config(id,ready,schema_version) VALUES('main',0,1);"];
 for(const r of rows)sql.push(`INSERT INTO users(id) VALUES(${quote(r.userId)}) ON CONFLICT DO NOTHING;`,`INSERT INTO auth_accounts(user_id,email,display_name,is_super_admin,created_at) VALUES(${[r.userId,r.email,r.name,Number(r.superAdmin),time].map(quote).join(',')});`,`INSERT INTO auth_action_tokens(token_hash,user_id,kind,account_version,origin,expires_at,created_at) VALUES(${[r.hash,r.userId,'activate',1,r.origin,time+60*60*1000,time].map(quote).join(',')});`);
 sql.push(`INSERT INTO auth_events(id,user_id,actor_id,event,at) VALUES(${[crypto.randomUUID(),owner.userId,'offline-operator','explicit_provision',time].map(quote).join(',')});`,"DELETE FROM auth_guards WHERE id IN ('provision','empty');");
 return {sql:sql.join('\n')+'\n',links,report:{sourceRevision:row.revision,sourceHash,storage:config.storage,accounts:rows.map(({userId,email,superAdmin,origin})=>({userId,email,superAdmin,origin})),ready:false},readySQL:`-- Manual staging approval only. Confirm source hash, roles, origin and backup first.\nUPDATE auth_config SET ready=1 WHERE id='main' AND schema_version=1 AND EXISTS(SELECT 1 FROM auth_accounts WHERE user_id=${quote(owner.userId)} AND is_super_admin=1);\nSELECT ready,schema_version FROM auth_config;\n`};
}
async function main(){
 const [sourceFile,configFile,directory]=process.argv.slice(2);if(!directory)throw new Error('Usage: node scripts/prepare-auth.mjs <exported-source.json OR --new> <reviewed-accounts.json> <NEW-private-output-directory>');
 const config=JSON.parse((await readFile(configFile,'utf8')).replace(/^\uFEFF/,''));
 const sourceBytes=sourceFile==='--new'?Buffer.from(JSON.stringify(newWorkspaceSource(config))):await readFile(sourceFile),source=JSON.parse(sourceBytes.toString('utf8').replace(/^\uFEFF/,'')),artifacts=await prepareAuth(source,config);
 await mkdir(directory,{mode:0o700});
 for(const [name,value] of Object.entries({'source.json':sourceBytes,'auth-schema.sql':await readFile(new URL('../db/staged/0002_auth.sql',import.meta.url)),'auth-import.sql':artifacts.sql,'auth-ready.sql':artifacts.readySQL,'private-activation-links.json':JSON.stringify(artifacts.links,null,2),'review.json':JSON.stringify(artifacts.report,null,2)}))await writeFile(path.join(directory,name),value,{flag:'wx',mode:0o600});
 if(sourceFile==='--new'&&config.storage==='legacy')await writeFile(path.join(directory,'new-workspace.sql'),`-- NEW EMPTY STAGING DATABASE ONLY. Existing main rows cause an error, never replacement.\nCREATE TABLE IF NOT EXISTS app_state(id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL);\nINSERT INTO app_state(id,revision,payload) VALUES('main',0,${quote(source.payload)});\n`,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({output:path.resolve(directory),accounts:artifacts.report.accounts.length,ready:false,notice:'Private activation links were saved to a restricted file; no secret is printed. No database was changed.'}));
}
if(process.argv[1]?.endsWith('prepare-auth.mjs'))main().catch(e=>{console.error(e.message);process.exitCode=1;});
