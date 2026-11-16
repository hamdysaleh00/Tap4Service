// Only expiring authentication material is removed. Business data and security
// audit events are retained. A cron schedule must be approved/configured by ops.
export async function cleanupAuth(db,time=Date.now()){
 const statements=[
  db.prepare('DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_sessions WHERE expires_at<=? OR seen_at<=? LIMIT 1000)').bind(time,time-30*60*1000),
  db.prepare('DELETE FROM auth_action_tokens WHERE token_hash IN (SELECT token_hash FROM auth_action_tokens WHERE expires_at<=? LIMIT 1000)').bind(time),
  db.prepare('DELETE FROM auth_rate_buckets WHERE bucket_key IN (SELECT bucket_key FROM auth_rate_buckets WHERE expires_at<=? LIMIT 1000)').bind(time),
 ];
 const results=await db.batch(statements);return results.reduce((sum,r)=>sum+(r.meta?.changes??0),0);
}
