-- STAGED ONLY. No application identity provider or live data is switched here.
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS auth_config(id TEXT PRIMARY KEY CHECK(id='main'), ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN(0,1)), schema_version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS auth_accounts(
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 email TEXT NOT NULL UNIQUE CHECK(email=lower(email)),
 display_name TEXT NOT NULL,
 password_hash TEXT,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 is_super_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_super_admin IN(0,1)),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 email_verified_at INTEGER,
 mfa_secret_enc TEXT,
 mfa_last_step INTEGER NOT NULL DEFAULT -1,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions(
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES auth_accounts(user_id),
 account_version INTEGER NOT NULL,
 origin TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 seen_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 authenticated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id,expires_at);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_action_tokens(
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES auth_accounts(user_id),
 kind TEXT NOT NULL CHECK(kind IN('activate','reset')),
 account_version INTEGER NOT NULL,
 origin TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 used_at INTEGER,
 mfa_enrollment_enc TEXT,
 created_by TEXT,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_action_tokens_user ON auth_action_tokens(user_id,expires_at);
CREATE TABLE IF NOT EXISTS auth_rate_buckets(bucket_key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auth_rate_expiry ON auth_rate_buckets(expires_at);
CREATE TABLE IF NOT EXISTS auth_guards(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CONSTRAINT tap2serve_auth_conflict CHECK(valid=1));
CREATE TABLE IF NOT EXISTS auth_events(id TEXT PRIMARY KEY,user_id TEXT,actor_id TEXT,event TEXT NOT NULL,at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auth_events_recent ON auth_events(at,user_id);
