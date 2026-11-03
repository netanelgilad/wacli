import http from 'node:http';
import {refreshSnapshot} from './snapshot.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validate,needsApproval,syncSignal,runProcess as defaultRunProcess,publicOutput,commands} from './core.mjs';
function identity(home){try{const me=JSON.parse(fs.readFileSync(path.join(home,'.config/wacli/auth/creds.json'),'utf8')).me;return me?.id?{jid:me.id,verifiedFrom:'local-session-creds.me.id',networkVerified:false}:null;}catch{return null;}}
export function createWhatsAppServer({config,root,runProcess=defaultRunProcess,readIdentity=identity}) {
const state=path.join(root,'.private');
const binary=path.join(root,'vendor/wacli/dist/cli.js');
const busy=new Set();
const jobs=new Map();
function equal(a,b){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function cacheTime(home){try{return fs.statSync(path.join(home,'.config/wacli/data/messages.json')).mtime.toISOString();}catch{return null;}}

const server=http.createServer(async(req,res)=>{
 const reply=(code,body)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');
 const account=Object.values(config.accounts).find(a=>equal(token,a.token));
 if(!account)return reply(401,{error:'unauthorized'});
 if(req.method!=='POST'||req.url!=='/v1/call')return reply(404,{error:'not_found'});
 let raw='';try{for await(const chunk of req){raw+=chunk;if(raw.length>24000)return reply(413,{error:'request_limit'});}
 // The bearer alone selects the local HOME; legacy account input may only confirm it.
 const input=JSON.parse(raw);if(Object.hasOwn(input,'account')&&input.account!==account.id)return reply(403,{error:'account_mismatch'});
 const home=path.join(state,'accounts',account.id);const asOf=cacheTime(home);
 const statusPath=path.join(home,'sync-status.json');let prior=null;try{prior=JSON.parse(fs.readFileSync(statusPath,'utf8'));}catch{}
 if(input.command==='account')return reply(200,{account:account.id,identity:readIdentity(home),linked:!!readIdentity(home),sync:syncSignal('account',{},asOf,prior),commands:Object.keys(commands)});
 if(input.command==='jobStatus'){
  const job=jobs.get(input.args?.[0]);
  if(!job||job.account!==account.id)return reply(404,{error:'job_not_found'});
  const disclose=input.args?.[1]==='pairing-output';
  if(disclose&&req.headers['x-executor-approved']!=='true')return reply(403,{error:'approval_required'});
  return reply(200,job.command==='link'&&!disclose?{...job,output:'[Pairing output requires explicit approval]'}:job);
 }
 let args=validate(input.command,input.args??[],home);
 // Monitoring never initializes a new WhatsApp identity or requests pairing.
 if(!['link','unlink','search'].includes(input.command)&&!readIdentity(home))return reply(409,{error:'account_not_linked'});
 // Legacy bridge approval assertion; the per-account bearer remains mandatory.
 // This is not an independently verifiable native Executor approval proof.
 if(needsApproval(input.command,args)&&req.headers['x-executor-approved']!=='true')return reply(403,{error:'approval_required'});
 if(busy.has(account.id))return reply(409,{error:'account_busy'});
 busy.add(account.id);
 // Borrowed linked-device identities must not open a second upstream socket.
 // Refresh only the source cache; never copy changing session keys back or log in.
 if(account.monitoringSource && ['sync','status','chats','groups','messages','search','listen','download'].includes(input.command)){
  try{
   const sync=refreshSnapshot(account.monitoringSource,home);
   if(input.command==='sync'){
    fs.writeFileSync(statusPath,JSON.stringify(sync),{mode:0o600});
    return reply(200,{account:account.id,ok:true,sync,output:{cacheRefreshed:true},error:null});
   }
   if(input.command==='listen'){
    const id=crypto.randomUUID();const job={id,account:account.id,command:'listen',state:'running',startedAt:new Date().toISOString(),output:{sync}};jobs.set(id,job);
    const seen=new Set(Object.values(JSON.parse(fs.readFileSync(account.monitoringSource,'utf8')).messages).flat().map(m=>m.chatId+':'+m.id));
    const timer=setInterval(()=>{try{const next=refreshSnapshot(account.monitoringSource,home);const messages=Object.values(JSON.parse(fs.readFileSync(path.join(home,'.config/wacli/data/messages.json'),'utf8')).messages).flat().filter(m=>{const key=m.chatId+':'+m.id;if(seen.has(key))return false;seen.add(key);return true;});job.output={sync:next,...(args.includes('--quiet')?{}:{messages:publicOutput(JSON.stringify(messages.slice(-1000)))})};}catch{job.state='error';clearInterval(timer);busy.delete(account.id);}},5000);
    setTimeout(()=>{clearInterval(timer);if(job.state==='running')job.state='completed';busy.delete(account.id);setTimeout(()=>jobs.delete(id),600000).unref();},60000).unref();
    return reply(200,{account:account.id,job:id,state:'running',mode:sync.mode,pollTool:'jobStatus'});
   }
   if(input.command==='messages'&&!args.includes('--no-connect'))args.push('--no-connect');
   const executable=['status','chats','groups','download'].includes(input.command)?path.join(root,'companion/cached.mjs'):binary;
   const result=await runProcess(executable,input.command,args,home);
   return reply(200,{account:account.id,ok:result.code===0,sync,output:publicOutput(result.stdout),error:result.code===0?null:'command_failed'});
  }catch{busy.delete(account.id);return reply(503,{account:account.id,ok:false,sync:{status:'error',asOf,observedAt:new Date().toISOString()},error:'source_snapshot_failed'});}
  finally{if(input.command!=='listen')busy.delete(account.id);}
 }
 if(['link','listen'].includes(input.command)){
  const id=crypto.randomUUID();const job={id,account:account.id,command:input.command,state:'running',startedAt:new Date().toISOString(),output:''};jobs.set(id,job);
  // Results remain only in bounded process memory, never in service logs.
  runProcess(binary,input.command,args,home,input.command==='link'?300000:60000,stdout=>{job.output=publicOutput(stdout);}).then(result=>{
   Object.assign(job,{state:result.timedOut?'timed-out':result.code===0?'completed':'error',finishedAt:new Date().toISOString(),output:publicOutput(result.stdout)});
  }).finally(()=>{busy.delete(account.id);setTimeout(()=>jobs.delete(id),600000).unref();});
  return reply(200,{account:account.id,job:id,state:'running',pollTool:'jobStatus'});
 }
 try{
 const result=await runProcess(binary,input.command,args,home,input.command==='listen'?60000:55000);
 if(input.command==='unlink'&&result.code===0){delete account.monitoringSource;fs.writeFileSync(path.join(state,'accounts.json'),JSON.stringify(config),{mode:0o600});}
 const sync=syncSignal(input.command,result,cacheTime(home),prior);
 if(input.command==='sync')fs.writeFileSync(statusPath,JSON.stringify(sync),{mode:0o600});
 reply(200,{account:account.id,ok:result.code===0&&!result.timedOut,exitCode:result.code,timedOut:result.timedOut,sync,output:publicOutput(result.stdout),error:result.code===0?null:result.timedOut?'process_timeout':'command_failed'});
 }finally{busy.delete(account.id);}
 }catch{reply(400,{error:'invalid_request'});}
});
return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const config=JSON.parse(fs.readFileSync(path.join(root,'.private/accounts.json'),'utf8'));
 createWhatsAppServer({config,root}).listen(config.port,config.bind,()=>console.log('WhatsApp companion ready'));
}
