import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validate,needsApproval,syncSignal,runProcess,publicOutput,commands} from './core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const state=path.join(root,'.private');
const config=JSON.parse(fs.readFileSync(path.join(state,'accounts.json'),'utf8'));
const binary=path.join(root,'vendor/wacli/dist/cli.js');
const busy=new Set();
const jobs=new Map();
function equal(a,b){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function cacheTime(home){try{return fs.statSync(path.join(home,'.config/wacli/data/messages.json')).mtime.toISOString();}catch{return null;}}
function identity(home){try{const me=JSON.parse(fs.readFileSync(path.join(home,'.config/wacli/auth/creds.json'),'utf8')).me;return me?.id?{jid:me.id,verifiedFrom:'local-session-creds.me.id',networkVerified:false}:null;}catch{return null;}}
const server=http.createServer(async(req,res)=>{
 const reply=(code,body)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');
 const account=Object.values(config.accounts).find(a=>equal(token,a.token));
 if(!account)return reply(401,{error:'unauthorized'});
 if(req.method!=='POST'||req.url!=='/v1/call')return reply(404,{error:'not_found'});
 let raw='';try{for await(const chunk of req){raw+=chunk;if(raw.length>24000)return reply(413,{error:'request_limit'});}
 const input=JSON.parse(raw);if(input.account!==account.id)return reply(403,{error:'account_mismatch'});
 const home=path.join(state,'accounts',account.id);const asOf=cacheTime(home);
 const statusPath=path.join(home,'sync-status.json');let prior=null;try{prior=JSON.parse(fs.readFileSync(statusPath,'utf8'));}catch{}
 if(input.command==='account')return reply(200,{account:account.id,identity:identity(home),linked:!!identity(home),sync:syncSignal('account',{},asOf,prior),commands:Object.keys(commands)});
 if(input.command==='jobStatus'){
  const job=jobs.get(input.args?.[0]);
  if(!job||job.account!==account.id)return reply(404,{error:'job_not_found'});
  return reply(200,job);
 }
 const args=validate(input.command,input.args??[],home);
 // This header is issued only by the Executor mutation after its approval policy.
 // It is not exposed as a tool input; the bearer credential is held by Executor.
 if(needsApproval(input.command,args)&&req.headers['x-executor-approved']!=='true')return reply(403,{error:'approval_required'});
 if(busy.has(account.id))return reply(409,{error:'account_busy'});
 busy.add(account.id);
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
 const sync=syncSignal(input.command,result,cacheTime(home),prior);
 if(input.command==='sync')fs.writeFileSync(statusPath,JSON.stringify(sync),{mode:0o600});
 reply(200,{account:account.id,ok:result.code===0&&!result.timedOut,exitCode:result.code,timedOut:result.timedOut,sync,output:publicOutput(result.stdout),error:result.code===0?null:result.timedOut?'process_timeout':'command_failed'});
 }finally{busy.delete(account.id);}
 }catch{reply(400,{error:'invalid_request'});}
});
server.listen(config.port,config.bind,()=>console.log('WhatsApp companion ready'));
