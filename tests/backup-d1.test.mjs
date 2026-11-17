import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdtemp,writeFile,readFile,mkdir,rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createInitialState } from '../lib/domain.mjs';
import { migrationPlan } from '../lib/normalized-migration.mjs';
import { applyPlan } from '../scripts/normalized-migration.mjs';
import { exportSql } from '../lib/backup.mjs';
test('offline backup CLI rehearses/prepares a recovery artifact that restores into an isolated real D1 database',async()=>{
 const workspace=path.resolve('outputs');await mkdir(workspace,{recursive:true});const directory=await mkdtemp(path.join(workspace,'d1-recovery-'));
 // Every file/recursive cleanup target is resolved and constrained to outputs.
 assert(directory.startsWith(workspace+path.sep));
 try{
  const state=createInitialState({id:'drill-owner',email:'drill@example.test'});state.restaurants[0].menu[0].description='مرحبا; preserved\nsecond line';
  const db=new DatabaseSync(':memory:');applyPlan(db,migrationPlan({id:'main',revision:0,payload:JSON.stringify(state)}));db.exec('UPDATE migration_runs SET verified=1');
  db.exec('CREATE TABLE auth_sessions(token_hash TEXT PRIMARY KEY); CREATE TABLE auth_action_tokens(token_hash TEXT PRIMARY KEY); INSERT INTO auth_sessions VALUES(\'restored-login\'); INSERT INTO auth_action_tokens VALUES(\'restored-reset\');');
  const sql=path.join(directory,'source.sql');await writeFile(sql,exportSql(db));db.close();
  const encrypted=path.join(directory,'sealed.backup'),recovery=path.join(directory,'recovery.backup'),recoverySql=path.join(directory,'recovery.sql');
  const environment={...process.env,TAP2SERVE_BACKUP_KEY:randomBytes(32).toString('base64')};
  const cli=(...args)=>{const result=spawnSync(process.execPath,['scripts/backup-restore.mjs',...args],{env:environment,encoding:'utf8'});assert.equal(result.status,0,'Offline backup command failed.');return JSON.parse(result.stdout);};
  cli('seal','--input',sql,'--output',encrypted,'--source-id','isolated-drill','--storage','normalized');
  assert.equal(cli('rehearse','--input',encrypted,'--source-id','isolated-drill').verified,true);
  const report=cli('prepare-recovery','--input',encrypted,'--source-id','isolated-drill','--output',recovery);assert(report.rotatedGuestCapabilities>0);assert.equal(report.revokedAuthenticationRecords,2);
  cli('unseal','--input',recovery,'--source-id','isolated-drill','--output',recoverySql);
  const config=path.join(directory,'wrangler.json');await writeFile(config,JSON.stringify({name:'isolated-restore-drill',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'isolated-restore',database_id:'00000000-0000-4000-8000-000000000000'}]}));
  const base=['--import',pathToFileURL(path.resolve('scripts/sites-env.mjs')).href,path.resolve('node_modules/wrangler/bin/wrangler.js'),'d1','execute','DB','--local','--config',config,'--persist-to',path.join(directory,'state')];
  const restored=spawnSync(process.execPath,[...base,'--file',recoverySql],{encoding:'utf8'});assert.equal(restored.status,0,`Local D1 restore failed: ${restored.stderr || restored.stdout}`);
  const result=spawnSync(process.execPath,[...base,'--command',"SELECT (SELECT COUNT(*) FROM orders) AS orders,(SELECT COUNT(*) FROM payments) AS payments,(SELECT COUNT(*) FROM auth_sessions) AS logins,(SELECT COUNT(*) FROM auth_action_tokens) AS resets,(SELECT COUNT(*) FROM menu_items WHERE description LIKE '%preserved%second line') AS unicode_rows",'--json'],{encoding:'utf8'});
  assert.equal(result.status,0,'Restored local D1 verification failed.');const data=JSON.parse(result.stdout)[0].results[0];assert.equal(data.orders,state.restaurants[0].orders.length);assert.equal(data.payments,state.restaurants[0].payments.length);assert.equal(data.logins,0);assert.equal(data.resets,0);assert.equal(data.unicode_rows,1);
  assert.match(await readFile(encrypted,'utf8'),/ciphertext/);
 }finally{const resolved=path.resolve(directory);if(!resolved.startsWith(workspace+path.sep))throw new Error('Refusing cleanup outside the recovery workspace.');await rm(resolved,{recursive:true,force:true});}
});
