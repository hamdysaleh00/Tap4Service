import { redirect } from 'next/navigation';
import { independentAuth } from '../../lib/auth-server';
import AuthForm from '../auth-form';
export const dynamic='force-dynamic';
export default function Activate(){if(!independentAuth())redirect('/login');return <AuthForm mode="activate"/>;}
