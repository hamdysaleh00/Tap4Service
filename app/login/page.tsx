import { redirect } from 'next/navigation';
import { independentAuth } from '../../lib/auth-server';
import AuthForm from '../auth-form';
import { env } from 'cloudflare:workers';
export const dynamic='force-dynamic';
export default function Login(){if(!independentAuth()){if(env.TAP2SERVE_ACCESS_ISSUER)redirect('/dashboard');redirect('/signin-with-chatgpt?return_to=/dashboard');}return <AuthForm mode="login"/>;}
