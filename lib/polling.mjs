// Completion-scheduled polling: one request at a time, no timer races, and no
// automatic replay of mutations. The transport and clock are injected for tests.
export function createPoller({request,apply,onStatus=state=>{void state;},interval=2000,maxBackoff=60000,timeout=15000,random=Math.random,setTimer=setTimeout,clearTimer=clearTimeout}){
 let stopped=true,paused=false,running=null,timer=null,epoch=0,failures=0,queued=false,waiters=[],controller=null,deadline=null;
 const metrics={requests:0,failures:0,unchanged:0,discarded:0,maxConcurrent:0};
 const status=(state,extra={})=>onStatus({state,failures,...extra});
 const cancelTimer=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 const schedule=delay=>{cancelTimer();if(!stopped&&!paused)timer=setTimer(()=>{timer=null;void tick();},delay);};
 function settle(){const pending=waiters;waiters=[];for(const resolve of pending)resolve();}
 async function tick(){
  if(stopped||paused)return;
  if(running){queued=true;return;}
  const generation=epoch;controller=new AbortController();const active=controller;let timedOut=false;
  deadline=setTimer(()=>{timedOut=true;active.abort();},timeout);
  metrics.requests++;metrics.maxConcurrent=1;status(failures?'retrying':'refreshing');
  running=(async()=>{
   try{
    const result=await request(active.signal);
    if(stopped||paused||generation!==epoch||active.signal.aborted){metrics.discarded++;return;}
    if(result?.unchanged)metrics.unchanged++;else await apply(result);
    failures=0;status('connected');
   }catch(error){
    if(stopped||paused||generation!==epoch||active.signal.aborted&&!timedOut)return;
    failures++;metrics.failures++;
    const terminal=[401,403,404,410].includes(error.status);
    const retryAfter=Math.min(300000,Math.max(0,error.retryAfter||0));
    const delay=Math.max(retryAfter,Math.min(maxBackoff,interval*2**Math.min(failures-1,8)*(0.8+0.4*random())));
    status(terminal?'blocked':'retrying',{error,delay:terminal?null:delay});
    if(terminal){paused=true;queued=false;}else schedule(delay);
   }finally{
    if(deadline!==null)clearTimer(deadline);deadline=null;running=null;controller=null;
    if(stopped||paused){settle();return;}
    if(queued){queued=false;schedule(0);}else{settle();if(timer===null)schedule(interval);}
   }
  })();
  await running;
 }
 return {
  start(){if(!stopped)return;stopped=false;paused=false;schedule(0);},
  // Invalidate every response started before a successful/uncertain command.
  refresh(){if(stopped)return Promise.resolve();epoch++;queued=true;cancelTimer();if(!running){queued=false;schedule(0);}return new Promise(resolve=>waiters.push(resolve));},
  pause(state='paused'){paused=true;epoch++;cancelTimer();controller?.abort();status(state);settle();},
  resume(){if(stopped)return;paused=false;failures=0;epoch++;queued=!!running;cancelTimer();if(!running)schedule(0);},
  stop(){stopped=true;epoch++;queued=false;cancelTimer();controller?.abort();status('stopped');settle();},
  metrics,
 };
}
export function createOrderTracker(){
 let scope=null,seen=new Set(),initialized=false;
 return {
  accept(nextScope,orders){if(scope!==nextScope){scope=nextScope;seen=new Set();initialized=false;}
   const active=orders.filter(o=>o.status!=='SERVED'),incoming=active.filter(o=>!seen.has(o.id));seen=new Set(active.map(o=>o.id));
   const notify=initialized?incoming:[];initialized=true;return notify;
  },
 };
}
export function parseRetryAfter(value,time=Date.now()){
 if(!value)return 0;const seconds=Number(value);return Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(value)-time)||0;
}
