import { sql } from 'drizzle-orm';
import { sqliteTable,text,integer,check,index } from 'drizzle-orm/sqlite-core';
import { users } from './schema';
export const authConfig=sqliteTable('auth_config',{id:text('id').primaryKey(),ready:integer('ready').notNull().default(0),schemaVersion:integer('schema_version').notNull().default(1)},()=>[check('auth_config_id',sql`id='main'`),check('auth_config_ready',sql`ready IN(0,1)`)]);
export const authAccounts=sqliteTable('auth_accounts',{
 userId:text('user_id').primaryKey().references(()=>users.id),email:text('email').notNull().unique(),displayName:text('display_name').notNull(),passwordHash:text('password_hash'),active:integer('active').notNull().default(1),isSuperAdmin:integer('is_super_admin').notNull().default(0),version:integer('version').notNull().default(1),emailVerifiedAt:integer('email_verified_at'),mfaSecretEnc:text('mfa_secret_enc'),mfaLastStep:integer('mfa_last_step').notNull().default(-1),createdAt:integer('created_at').notNull(),
},()=>[check('auth_account_active',sql`active IN(0,1)`),check('auth_account_admin',sql`is_super_admin IN(0,1)`),check('auth_account_version',sql`version>=1`),check('auth_account_email',sql`email=lower(email)`)]);
export const authSessions=sqliteTable('auth_sessions',{
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>authAccounts.userId),accountVersion:integer('account_version').notNull(),origin:text('origin').notNull(),createdAt:integer('created_at').notNull(),seenAt:integer('seen_at').notNull(),expiresAt:integer('expires_at').notNull(),authenticatedAt:integer('authenticated_at').notNull(),
},t=>[index('auth_sessions_user').on(t.userId,t.expiresAt),index('auth_sessions_expiry').on(t.expiresAt)]);
export const authActionTokens=sqliteTable('auth_action_tokens',{
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>authAccounts.userId),kind:text('kind').notNull(),accountVersion:integer('account_version').notNull(),origin:text('origin').notNull(),expiresAt:integer('expires_at').notNull(),usedAt:integer('used_at'),mfaEnrollmentEnc:text('mfa_enrollment_enc'),createdBy:text('created_by'),createdAt:integer('created_at').notNull(),
},t=>[index('auth_action_tokens_user').on(t.userId,t.expiresAt),check('auth_token_kind',sql`kind IN('activate','reset')`)]);
export const authRateBuckets=sqliteTable('auth_rate_buckets',{bucketKey:text('bucket_key').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()},t=>[index('auth_rate_expiry').on(t.expiresAt)]);
export const authGuards=sqliteTable('auth_guards',{id:text('id').primaryKey(),valid:integer('valid').notNull()},()=>[check('tap2serve_auth_conflict',sql`valid=1`)]);
export const authEvents=sqliteTable('auth_events',{id:text('id').primaryKey(),userId:text('user_id'),actorId:text('actor_id'),event:text('event').notNull(),at:integer('at').notNull()},t=>[index('auth_events_recent').on(t.at,t.userId)]);
