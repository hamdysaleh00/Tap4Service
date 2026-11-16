// OFFLINE ONLY. Never import this module into a Worker/client bundle.
import { DatabaseSync, constants } from 'node:sqlite';
import { createHash,createCipheriv,createDecipheriv,randomBytes,randomUUID } from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):value instanceof Uint8Array?`X'${Buffer.from(value).toString('hex')}'`:"'"+String(value).replaceAll("'","''")+"'";
const tables=db=>db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").all();
export function restoreSql(sql){
 if(typeof sql!=='string'||!sql||Buffer.byteLength(sql)>128*1024*1024)throw new Error('Invalid or oversized SQL backup.');
 const db=new DatabaseSync(':memory:',{allowExtension:false});
 if(!db.setAuthorizer||!db.enableDefensive){db.close();throw new Error('Backup tooling requires Node 24.12 or newer.');}
 db.enableDefensive(true);
 db.setAuthorizer((action,arg1,arg2)=>{
  if([constants.SQLITE_ATTACH,constants.SQLITE_DETACH,constants.SQLITE_CREATE_VTABLE].includes(action))return constants.SQLITE_DENY;
  if(action===constants.SQLITE_PRAGMA&&!['foreign_keys','defer_foreign_keys'].includes(String(arg1).toLowerCase()))return constants.SQLITE_DENY;
  if(action===constants.SQLITE_FUNCTION&&['load_extension','writefile','readfile'].includes(String(arg2).toLowerCase()))return constants.SQLITE_DENY;
  return constants.SQLITE_OK;
 });
 try{db.exec('PRAGMA foreign_keys=OFF');db.exec(sql);db.setAuthorizer(null);db.exec('PRAGMA foreign_keys=ON');if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw new Error();return db;}
 catch{db.close();throw new Error('Backup SQL failed isolated restore or integrity checks.');}
}
export function databaseManifest(db,storage){
 const names=tables(db).map(row=>row.name);
 const required=storage==='normalized'?['restaurants','dining_tables','sessions','orders','order_items','payments','platform_config','migration_runs']:storage==='legacy'?['app_state']:[];
 if(!required.length||required.some(name=>!names.includes(name)))throw new Error('Backup does not contain the selected application schema.');
 if(storage==='legacy'&&!db.prepare("SELECT id FROM app_state WHERE id='main' AND json_valid(payload)").get())throw new Error('Backup workspace is missing.');
 if(storage==='normalized'&&(!db.prepare("SELECT owner_id FROM platform_config WHERE id='main'").get()||!db.prepare('SELECT id FROM migration_runs WHERE verified=1').get()))throw new Error('Backup platform is not verified.');
 const rows=Object.fromEntries(names.map(name=>{const values=db.prepare(`SELECT * FROM ${quote(name)}`).all().map(row=>JSON.stringify(row,(_key,value)=>value instanceof Uint8Array?{blob:Buffer.from(value).toString('base64')}:value)).sort();return [name,{count:values.length,sha256:hash(values.join('\n'))}];}));
 const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY type,name").all();
 return {storage,schemaHash:hash(JSON.stringify(schema)),tables:rows};
}
function keyBytes(key){const bytes=typeof key==='string'?Buffer.from(key,'base64'):key;if(!bytes||bytes.length!==32)throw new Error('A separate 32-byte backup encryption key is required.');return bytes;}
export function sealBackup(sql,{sourceId,storage},key){
 if(typeof sourceId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(sourceId))throw new Error('An explicit database source identifier is required.');
 const db=restoreSql(sql);let manifest;try{manifest=databaseManifest(db,storage);}finally{db.close();}
 const payload={sql,sourceId,createdAt:new Date().toISOString(),manifest,sqlSha256:hash(sql)};
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes(key),iv);cipher.setAAD(Buffer.from('tap2serve-backup-v1'));
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
 return JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')});
}
export function openBackup(envelope,key,expectedSourceId){
 try{const value=JSON.parse(envelope);if(value.version!==1)throw new Error();const decipher=createDecipheriv('aes-256-gcm',keyBytes(key),Buffer.from(value.iv,'base64'));decipher.setAAD(Buffer.from('tap2serve-backup-v1'));decipher.setAuthTag(Buffer.from(value.tag,'base64'));const payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext,'base64')),decipher.final()]).toString('utf8'));if(payload.sourceId!==expectedSourceId||payload.sqlSha256!==hash(payload.sql))throw new Error();return payload;}
 catch{throw new Error('Backup authentication, source identity or checksum verification failed.');}
}
export function revokeRestoredSessions(db,storage){
 const names=new Set(tables(db).map(row=>row.name));let revoked=0,rotated=0;
 db.exec('BEGIN IMMEDIATE');
 try{
  for(const name of ['auth_sessions','auth_action_tokens'])if(names.has(name))revoked+=db.prepare(`DELETE FROM ${quote(name)}`).run().changes;
  if(storage==='normalized'){
   const active=db.prepare("SELECT restaurant_id,id FROM sessions WHERE released_at IS NULL AND status IN ('OPEN','BILL_REQUESTED','FINALIZED')").all();
   for(const session of active){db.prepare('UPDATE sessions SET capability=?,version=version+1 WHERE restaurant_id=? AND id=?').run(randomUUID()+randomUUID(),session.restaurant_id,session.id);rotated++;}
   for(const id of new Set(active.map(row=>row.restaurant_id)))db.prepare('UPDATE restaurants SET revision=revision+1 WHERE id=?').run(id);
  }else{
   const row=db.prepare("SELECT payload FROM app_state WHERE id='main'").get(),state=JSON.parse(row.payload);
   for(const restaurant of state.restaurants)for(const session of restaurant.sessions)if(!session.releasedAt&&session.status!=='CLOSED'){session.capability=randomUUID()+randomUUID();session.version=(session.version||0)+1;rotated++;}
   db.prepare("UPDATE app_state SET payload=?,revision=revision+1 WHERE id='main'").run(JSON.stringify(state));
  }
  db.exec('COMMIT');return {revokedAuthenticationRecords:revoked,rotatedGuestCapabilities:rotated};
 }catch{db.exec('ROLLBACK');throw new Error('Recovery credential invalidation failed.');}
}
export function exportSql(db){
 const tableList=tables(db),sql=['PRAGMA defer_foreign_keys=TRUE;',...tableList.map(row=>row.sql+';')];
 for(const table of tableList)for(const row of db.prepare(`SELECT * FROM ${quote(table.name)}`).all())sql.push(`INSERT INTO ${quote(table.name)}(${Object.keys(row).map(quote).join(',')}) VALUES(${Object.values(row).map(literal).join(',')});`);
 for(const row of db.prepare("SELECT sql FROM sqlite_master WHERE type IN ('index','trigger','view') AND sql IS NOT NULL AND name NOT GLOB '_cf_*' ORDER BY type,name").all())sql.push(row.sql+';');
 return sql.join('\n')+'\n';
}
export function rehearseBackup(envelope,key,sourceId,{prepareRecovery=false}={}){
 const payload=openBackup(envelope,key,sourceId),db=restoreSql(payload.sql);
 try{
  const actual=databaseManifest(db,payload.manifest.storage);if(JSON.stringify(actual)!==JSON.stringify(payload.manifest))throw new Error('Restored schema or data manifest does not match.');
  const invalidation=revokeRestoredSessions(db,payload.manifest.storage);
  const report={verified:true,sourceId,backupCreatedAt:payload.createdAt,storage:payload.manifest.storage,tableCount:Object.keys(actual.tables).length,sourceSqlSha256:payload.sqlSha256,...invalidation};
  return {report,...(prepareRecovery?{recoveryBackup:sealBackup(exportSql(db),{sourceId,storage:payload.manifest.storage},key)}:{})};
 }finally{db.close();}
}
