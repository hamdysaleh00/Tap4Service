'use client';
import {useSyncExternalStore} from 'react';
const subscribe=()=>()=>{};
const browserSnapshot=()=>true;
const serverSnapshot=()=>false;
// React checks the client snapshot after hydration, without an effect that
// synchronously updates component state. The server always renders a placeholder.
export function useBrowserReady(){return useSyncExternalStore(subscribe,browserSnapshot,serverSnapshot);}
export function useTableToken(){return useSyncExternalStore(subscribe,()=>new URLSearchParams(window.location.search).get('table'),()=>null);}
