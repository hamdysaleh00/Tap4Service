// Offline only: no Cloudflare credentials, network access or remote restore.
import { readFile,writeFile } from 'node:fs/promises';
import { sealBackup,openBackup,rehearseBackup } from '../lib/backup.mjs';
const [command,...args]=process.argv.slice(2),values={};
for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||!args[i+1])throw new Error('Expected --name value arguments.');values[args[i].slice(2)]=args[i+1];}
try{
 const key=process.env.TAP2SERVE_BACKUP_KEY;if(!key)throw new Error('Set TAP2SERVE_BACKUP_KEY through a secret environment variable.');
 const sourceId=values['source-id'];if(!sourceId)throw new Error('Provide --source-id.');
 const input=await readFile(values.input,'utf8');
 if(command==='seal'){
  const backup=sealBackup(input,{sourceId,storage:values.storage},key);await writeFile(values.output,backup,{flag:'wx',mode:0o600});console.log(JSON.stringify({sealed:true}));
 }else if(command==='rehearse'||command==='prepare-recovery'){
  const result=rehearseBackup(input,key,sourceId,{prepareRecovery:command==='prepare-recovery'});
  if(result.recoveryBackup)await writeFile(values.output,result.recoveryBackup,{flag:'wx',mode:0o600});
  if(values.report)await writeFile(values.report,JSON.stringify(result.report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result.report));
 }else if(command==='unseal'){
  const payload=openBackup(input,key,sourceId);await writeFile(values.output,payload.sql,{flag:'wx',mode:0o600});console.log(JSON.stringify({written:true,sensitiveSql:true}));
 }else throw new Error('Use seal, rehearse, prepare-recovery or unseal.');
}catch(error){console.error(JSON.stringify({error:error.code==='EEXIST'?'Output already exists; no file was replaced.':error.code?'Backup file operation failed.':error.message}));process.exitCode=1;}
