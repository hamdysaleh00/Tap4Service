import { redirect } from 'next/navigation';
import { independentAuth } from '../../lib/auth-server';
import AuthForm from '../auth-form';
import AccountTools from '../account-tools';
export const dynamic='force-dynamic';
export default function Account(){if(!independentAuth())redirect('/dashboard');return <><AuthForm mode="account"/><AccountTools/></>;}
