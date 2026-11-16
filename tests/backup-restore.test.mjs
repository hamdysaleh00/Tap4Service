import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { createInitialState } from '../lib/domain.mjs';
import { migrationPlan } from '../lib/normalized-migration.mjs';
import { applyPlan } from '../scripts/normalized-migration.mjs';
import { exportSql,restoreSql,sealBackup,openBackup,rehearseBackup,databaseManifest } from '../lib/backup.mjs';
const key=randomBytes(32),sourceId='disposable-d1-test';
function source(storage){
 const state=createInitialState({id:'owner',email:'private@example.test'}),db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE app_state(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL)');db.prepare('INSERT INTO app_state VALUES(?,0,?)').run('main',JSON.stringify(state));
 if(storage==='normalized'){applyPlan(db,migrationPlan({id:'main',revision:0,payload:JSON.stringify(state)}));db.exec('UPDATE migration_runs SET verified=1');}
 db.exec('CREATE TABLE auth_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER); CREATE TABLE auth_action_tokens(token_hash TEXT PRIMARY KEY,expires_at INTEGER); CREATE TABLE preserved_auth_accounts(user_id TEXT PRIMARY KEY,mfa_secret_enc TEXT);');
 db.prepare('INSERT INTO auth_sessions VALUES(?,?)').run('secret-hash',Date.now()+600000);db.prepare('INSERT INTO auth_action_tokens VALUES(?,?)').run('private-reset-hash',Date.now()+600000);db.prepare('INSERT INTO preserved_auth_accounts VALUES(?,?)').run('owner','encrypted-mfa-ciphertext');
 return {db,state};
}
for(const storage of ['legacy','normalized'])test(`${storage} encrypted SQL backup restores schema/all data and prepares session-safe disaster recovery`,()=>{
 const {db,state}=source(storage);const before=databaseManifest(db,storage),sql=exportSql(db),envelope=sealBackup(sql,{sourceId,storage},key);
 assert.doesNotMatch(envelope,/private@example|secret-hash|encrypted-mfa-ciphertext/);
 const payload=openBackup(envelope,key,sourceId),restored=restoreSql(payload.sql);assert.deepEqual(databaseManifest(restored,storage),before);restored.close();
 const {report,recoveryBackup}=rehearseBackup(envelope,key,sourceId,{prepareRecovery:true});assert.equal(report.verified,true);assert.equal(report.revokedAuthenticationRecords,2);assert(report.rotatedGuestCapabilities>0);
 const recovery=restoreSql(openBackup(recoveryBackup,key,sourceId).sql);
 assert.equal(recovery.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n,0);assert.equal(recovery.prepare('SELECT COUNT(*) AS n FROM auth_action_tokens').get().n,0);assert.equal(recovery.prepare('SELECT mfa_secret_enc FROM preserved_auth_accounts').get().mfa_secret_enc,'encrypted-mfa-ciphertext');
 if(storage==='normalized'){
  for(const table of ['orders','order_items','payments','dining_tables'])assert.deepEqual(databaseManifest(recovery,storage).tables[table],before.tables[table]);
  const original=state.restaurants[0].sessions[0];assert.notEqual(recovery.prepare('SELECT capability FROM sessions WHERE id=?').get(original.id).capability,original.capability);
 }else{
  const current=JSON.parse(recovery.prepare('SELECT payload FROM app_state').get().payload);for(const field of ['orders','payments','tables'])assert.deepEqual(current.restaurants[0][field],state.restaurants[0][field]);assert.notEqual(current.restaurants[0].sessions[0].capability,state.restaurants[0].sessions[0].capability);
 }
 assert.deepEqual(databaseManifest(db,storage),before);recovery.close();db.close();
});
test('wrong key, modified ciphertext/tag, wrong source identity, corrupt SQL and incomplete backups fail closed',()=>{
 const {db}=source('legacy'),envelope=sealBackup(exportSql(db),{sourceId,storage:'legacy'},key);
 assert.throws(()=>openBackup(envelope,randomBytes(32),sourceId));assert.throws(()=>openBackup(envelope,key,'wrong-database'));
 const corrupted=JSON.parse(envelope);corrupted.ciphertext=Buffer.from('tampered').toString('base64');assert.throws(()=>openBackup(JSON.stringify(corrupted),key,sourceId));
 assert.throws(()=>sealBackup('CREATE TABLE wrong(id TEXT);',{sourceId,storage:'normalized'},key));
 assert.throws(()=>restoreSql('NOT SQL'));assert.throws(()=>restoreSql("ATTACH DATABASE 'outputs/unsafe.sqlite' AS other;"));assert.throws(()=>restoreSql('PRAGMA writable_schema=ON;'));
 assert.throws(()=>restoreSql('CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES(42);'));
 db.close();
});
