// Offline only: no Cloudflare credentials, remote APIs, deployment, or production writes.
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { migrationPlan, verifyTables, importSQL, hash } from '../lib/normalized-migration.mjs';
import { schemaArtifacts } from './generate-normalized-schema.mjs';
import { insertStatement } from '../lib/normalized-model.mjs';

export function readTables(db,plan){return Object.fromEntries(Object.keys(plan.tables).map(t=>[t,db.prepare(`SELECT * FROM ${t}${t==='restaurants'?' ORDER BY position,id':''}`).all()]));}
export function applyPlan(db,plan){
 db.exec('PRAGMA foreign_keys=ON');db.exec(schemaArtifacts().sql);
 db.exec('BEGIN IMMEDIATE');
 try{
  const previous=db.prepare('SELECT * FROM migration_runs').all();
  if(previous.length&&(previous.length!==1||previous[0].id!==plan.id||previous[0].verified!==0))throw new Error('Candidate belongs to another source or has been activated. Use a new staging database.');
  if(!previous.length&&db.prepare('SELECT id FROM restaurants UNION ALL SELECT id FROM platform_config').all().length)throw new Error('Candidate is not empty.');
  for(const [table,rows] of Object.entries(plan.tables))for(const row of rows){const stmt=insertStatement(table,row);const keys=table==='membership_permissions'?'restaurant_id,membership_id,position':Object.hasOwn(row,'restaurant_id')&&table!=='platform_audit'?'restaurant_id,id':'id';db.prepare(stmt.sql+` ON CONFLICT(${keys}) DO NOTHING`).run(...stmt.params);}
  const report=verifyTables(plan,readTables(db,plan));
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Foreign key verification failed.');
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('SQLite integrity check failed.');
  db.exec('COMMIT');return report;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
async function main(){
 const [command,sourceFile,target,reportDir]=process.argv.slice(2);
 if(!['prepare','verify','verify-export'].includes(command)||!sourceFile||!target)throw new Error('Usage: node scripts/normalized-migration.mjs prepare <source.json> <NEW-output-directory> | verify <source.json> <candidate.sqlite> | verify-export <source.json> <staging-rows.json> <NEW-report-directory>');
 const bytes=await readFile(sourceFile),plan=migrationPlan(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')));
 if(command==='verify'){
  const db=new DatabaseSync(path.resolve(target),{readOnly:true});try{const report=verifyTables(plan,readTables(db,plan));if(db.prepare('PRAGMA foreign_key_check').all().length||db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Integrity check failed.');console.log(JSON.stringify(report,null,2));}finally{db.close();}return;
 }
 if(command==='verify-export'){
  if(!reportDir)throw new Error('A new report directory is required.');
  const exported=JSON.parse((await readFile(target,'utf8')).replace(/^\uFEFF/,'')),names=Object.keys(plan.tables);
  if(!Array.isArray(exported)||exported.length!==names.length+2||exported.some(r=>!Array.isArray(r.results)||r.success===false))throw new Error('Expected the ordered JSON result of verification-queries.sql including integrity checks.');
  const actual=Object.fromEntries(names.map((name,i)=>[name,exported[i].results.map(({__table,...row})=>{if(__table!==name)throw new Error('Unexpected export table order.');return row;})]));
  const report=verifyTables(plan,actual);
  if(exported[names.length].results.length||exported[names.length+1].results[0]?.quick_check!=='ok')throw new Error('D1 integrity verification failed.');
  await mkdir(reportDir);await writeFile(path.join(reportDir,'verification.json'),JSON.stringify(report,null,2),{flag:'wx'});
  await writeFile(path.join(reportDir,'activation.sql'),`-- Manual approval and a frozen, unchanged target are required.\nUPDATE migration_runs SET verified=1 WHERE id='${plan.id}' AND source_hash='${plan.sourceHash}' AND source_revision=${plan.sourceRevision} AND verified=0;\nSELECT id,verified FROM migration_runs;\n`,{flag:'wx'});
  console.log(JSON.stringify(report,null,2));return;
 }
 // Exclusive directory creation prevents overwriting even an earlier candidate.
 await mkdir(target);await writeFile(path.join(target,'source.json'),bytes,{flag:'wx'});
 await writeFile(path.join(target,'verification-queries.sql'),Object.keys(plan.tables).map(t=>`SELECT '${t}' AS __table,* FROM ${t}${t==='restaurants'?' ORDER BY position,id':''};`).join('\n')+'\nPRAGMA foreign_key_check;\nPRAGMA quick_check;\n',{flag:'wx'});
 const db=new DatabaseSync(path.join(target,'candidate.sqlite'));
 try{
  const report=applyPlan(db,plan);
  await writeFile(path.join(target,'schema.sql'),schemaArtifacts().sql,{flag:'wx'});
  await writeFile(path.join(target,'import.sql'),importSQL(plan),{flag:'wx'});
  await writeFile(path.join(target,'verification.json'),JSON.stringify({...report,sourceFileHash:hash(bytes),activation:'NOT ACTIVATED; migration_runs.verified remains 0'},null,2),{flag:'wx'});
  console.log(JSON.stringify({output:path.resolve(target),...report,activation:'NOT ACTIVATED'},null,2));
 }finally{db.close();}
}
if(process.argv[1]?.endsWith('normalized-migration.mjs'))main().catch(e=>{console.error(e.message);process.exitCode=1;});
