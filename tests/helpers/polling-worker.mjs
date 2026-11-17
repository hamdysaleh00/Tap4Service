import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { Miniflare,Log,LogLevel } from 'miniflare';
import { migrationPlan } from '../../lib/normalized-migration.mjs';
import { schemaArtifacts } from '../../scripts/generate-normalized-schema.mjs';
import { insertStatement } from '../../lib/normalized-model.mjs';
import { pollingFixture,pollingOwner } from './polling-fixture.mjs';
export async function pollingWorker(backend,{history=200,restaurants=3}={}){
 const root=path.resolve('dist/server'),files=await readdir(root,{recursive:true}),modules=['index.js',...files.filter(f=>f.endsWith('.js')&&f!=='index.js')].map(f=>({type:'ESModule',path:path.join(root,f)}));
 const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{TAP2SERVE_LOCAL_DEV:'true',TAP2SERVE_STORAGE:backend},log:new Log(LogLevel.NONE)}),db=await mf.getD1Database('DB'),state=pollingFixture({history,restaurants});
 await db.prepare('CREATE TABLE app_state(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL)').run();await db.prepare("INSERT INTO app_state VALUES('main',0,?)").bind(JSON.stringify(state)).run();
 if(backend==='normalized'){
  for(const sql of schemaArtifacts().sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  const plan=migrationPlan({id:'main',revision:0,payload:JSON.stringify(state)}),inserts=Object.entries(plan.tables).flatMap(([table,rows])=>rows.map(row=>insertStatement(table,row)));
  for(let i=0;i<inserts.length;i+=50)await db.batch(inserts.slice(i,i+50).map(s=>db.prepare(s.sql).bind(...s.params)));await db.prepare('UPDATE migration_runs SET verified=1').run();
 }
 const auth={'oai-authenticated-user-id':pollingOwner.id,'oai-authenticated-user-email':pollingOwner.email};
 const read=(path,headers={})=>mf.dispatchFetch('http://localhost'+path,{headers:{...auth,...headers}});
 const command=(action,body={})=>mf.dispatchFetch('http://localhost/api/command',{method:'POST',headers:{...auth,Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({action,restaurantId:state.restaurants[0].id,...body})});
 return {mf,db,state,read,command};
}
