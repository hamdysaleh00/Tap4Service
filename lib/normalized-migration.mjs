import { ensureRestaurantSlugs } from './tenant-routing.mjs';
import { createHash } from 'node:crypto';
import { upgradeSessionLifecycle } from './domain.mjs';
import { MODEL_VERSION, models, encodeRestaurant, decodeRestaurant, canonical } from './normalized-model.mjs';

export const hash = value => createHash('sha256').update(value).digest('hex');
export function parseSnapshot(input) {
 let row=input;
 // Accept the JSON result of: SELECT id,revision,payload FROM app_state WHERE id='main'.
 if(Array.isArray(row)){if(row.length!==1)throw new Error('Expected exactly one snapshot result.');row=row[0];}
 if(row?.results){if(row.success===false||row.results.length!==1)throw new Error('Expected exactly one successful main row.');row=row.results[0];}
 if(!row||row.id!=='main'||!Number.isSafeInteger(row.revision)||row.revision<0||typeof row.payload!=='string')throw new Error('Expected one exported app_state main row with revision and unmodified payload.');
 const state=JSON.parse(row.payload);
 if(!Array.isArray(state.restaurants)||!state.platformOwner||!Array.isArray(state.platformAudit))throw new Error('Invalid platform state.');
 return {row,state};
}
export function migrationPlan(input) {
 const {row,state:original}=parseSnapshot(input),state=structuredClone(original);
 upgradeSessionLifecycle(state);ensureRestaurantSlugs(state);
 const tables=Object.fromEntries([...Object.keys(models),'membership_permissions'].map(t=>[t,[]]));
 const ids=new Set();
 for(const t of state.restaurants){
  if(!t.id||ids.has(t.id))throw new Error('Missing or duplicate restaurant id.');ids.add(t.id);
  const encoded=encodeRestaurant(t);
  if(canonical(decodeRestaurant(encoded))!==canonical(t))throw new Error(`Lossless round-trip failed for restaurant ${t.id}.`);
  encoded.restaurants[0].position=tables.restaurants.length;
  encoded.restaurants[0].revision=0;
  for(const [table,rows] of Object.entries(encoded))tables[table].push(...rows);
 }
 const userIds=new Set([state.platformOwner,...state.restaurants.flatMap(t=>t.members.map(m=>m.userId).filter(Boolean))]);
 const metadata=Object.fromEntries(Object.entries(state).filter(([k])=>!['restaurants','platformAudit','platformOwner'].includes(k)));
 const {platformAudit,platformOwner}=state;
 const sourceHash=hash(row.payload),migrationId=`json-v${MODEL_VERSION}-${row.revision}-${sourceHash}`;
 return {id:migrationId,sourceRevision:row.revision,sourceHash,original,state,tables:{
  users:[...userIds].map(id=>({id})),
  platform_config:[{id:'main',owner_id:platformOwner,metadata_json:JSON.stringify(metadata)}],
  migration_runs:[{id:migrationId,source_revision:row.revision,source_hash:sourceHash,model_version:MODEL_VERSION,verified:0}],
  ...tables,
  platform_audit:platformAudit.map((event,position)=>({id:String(position),restaurant_id:event.restaurantId,position,event_json:JSON.stringify(event)})),
 }};
}
export function reconstruct(tables) {
 const config=tables.platform_config[0];
 return {...JSON.parse(config.metadata_json),platformOwner:config.owner_id,
  restaurants:tables.restaurants.map(r=>decodeRestaurant(Object.fromEntries([...Object.keys(models),'membership_permissions'].map(t=>[t,tables[t].filter(row=>row.restaurant_id===r.id)])))),
  platformAudit:[...tables.platform_audit].sort((a,b)=>a.position-b.position).map(r=>JSON.parse(r.event_json))};
}
export function verifyTables(plan,actual) {
 for(const [table,expected] of Object.entries(plan.tables)){
  if(actual[table]?.length!==expected.length)throw new Error(`Row count mismatch: ${table}`);
  const key=r=>canonical(table==='membership_permissions'?[r.restaurant_id,r.membership_id,r.position]:[r.restaurant_id,r.id]);
  const rows=new Map(actual[table].map(r=>[key(r),r]));
  for(const expectedRow of expected){const found=rows.get(key(expectedRow));if(!found)throw new Error(`Missing row: ${table}`);for(const [k,v] of Object.entries(expectedRow))if(found[k]!==v)throw new Error(`Value mismatch: ${table}.${k}`);}
 }
 if(canonical(reconstruct(actual))!==canonical(plan.state))throw new Error('Reconstructed state differs from the source after the existing lifecycle upgrade.');
 return {sourceRevision:plan.sourceRevision,sourceHash:plan.sourceHash,modelVersion:MODEL_VERSION,counts:Object.fromEntries(Object.entries(actual).map(([t,rows])=>[t,rows.length])),stateHash:hash(canonical(plan.state)),verified:true};
}
// Literal SQL is generated offline, never from HTTP input. Oversized records
// stop for review rather than exceeding D1's SQL limit or truncating history.
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
export function importSQL(plan) {
 const statements=[`-- STAGING CLONE ONLY. Resumable; conflicts fail instead of replacing data.`,
  `INSERT INTO commit_guards(id,valid) VALUES('import',CASE WHEN NOT EXISTS(SELECT 1 FROM migration_runs) AND NOT EXISTS(SELECT 1 FROM restaurants) AND NOT EXISTS(SELECT 1 FROM platform_config) OR EXISTS(SELECT 1 FROM migration_runs WHERE id=${literal(plan.id)} AND verified=0) THEN 1 ELSE 0 END);`,
  "DELETE FROM commit_guards WHERE id='import';"];
 for(const [table,rows] of Object.entries(plan.tables))for(const row of rows){
  const columns=Object.keys(row),values=columns.map(k=>literal(row[k]));
  const statement=`INSERT INTO ${table}(${columns.join(',')}) VALUES(${values.join(',')}) ON CONFLICT DO NOTHING;`;
  const check=`INSERT INTO commit_guards(id,valid) VALUES('import',CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE ${columns.map((c,i)=>c+' IS '+values[i]).join(' AND ')}) THEN 1 ELSE 0 END);`;
  if(Buffer.byteLength(statement)>90000||Buffer.byteLength(check)>90000)throw new Error(`Record in ${table} exceeds safe SQL statement size; use a bound-parameter staging importer after manual review.`);
  statements.push(statement,check,"DELETE FROM commit_guards WHERE id='import';");
 }
 return statements.join('\n')+'\n';
}
