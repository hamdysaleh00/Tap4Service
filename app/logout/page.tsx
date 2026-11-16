import { redirect } from 'next/navigation';
import { independentAuth } from '../../lib/auth-server';
import AuthForm from '../auth-form';
import { env } from 'cloudflare:workers';
export const dynamic='force-dynamic';
export default function Logout(){if(!independentAuth()){if(env.TAP2SERVE_ACCESS_ISSUER)redirect('/cdn-cgi/access/logout');redirect('/signout-with-chatgpt?return_to=/');}return <AuthForm mode="logout"/>;}
