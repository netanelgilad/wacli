import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
export const commands = {
 link: {'--serve':0,'--port':1}, unlink:{}, status:{}, sync:{'--timeout':1},
 chats:{'--groups':0,'--dms':0,'--json':0}, groups:{'--json':0},
 messages:{'--chat':1,'--groups':0,'--dms':0,'--since':1,'--until':1,'--sender':1,'--search':1,'--limit':1,'--json':0,'--no-connect':0,'--include-media':0,'--media-dir':1},
 search:{'--since':1,'--limit':1,'--json':0}, download:{'--output':1,'-o':1,'--json':0}, listen:{'--quiet':0}
};
export function validate(command,args,home) {
 if(!Object.hasOwn(commands,command)||!Array.isArray(args)||args.length>40) throw Error('invalid_command');
 const out=[];let positional=0;const flags=new Set();
 for(let i=0;i<args.length;i++) {
  const arg=args[i]; if(typeof arg!=='string'||arg.length>4096||/[\x00-\x1f]/.test(arg)) throw Error('invalid_argument');
  if(!arg.startsWith('-')) {if(!['search','download'].includes(command)||positional++) throw Error('unexpected_argument');out.push(arg);continue;}
  const eq=arg.indexOf('=');const flag=eq<0?arg:arg.slice(0,eq); const arity=commands[command][flag];
  if(arity===undefined||flags.has(flag)) throw Error('invalid_option');flags.add(flag);out.push(flag);
  if(arity===0){if(eq>=0)throw Error('invalid_option_value');continue;}
  let value=eq<0?args[++i]:arg.slice(eq+1);
  if(typeof value!=='string'||!value||/[\x00-\x1f]/.test(value)||value.startsWith('-'))throw Error('invalid_option_value');
  if(['--output','-o','--media-dir'].includes(flag)) {
   const root=path.join(home,'media');value=path.resolve(root,value);
   if(value!==root&&!value.startsWith(root+path.sep))throw Error('media_path_outside_account');
   // Refuse symlink traversal through any existing ancestor.
   for(let p=value;p!==root;p=path.dirname(p))if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('media_symlink');
  }
  if(flag==='--timeout'&&(!/^[1-9]\d?$/.test(value)||+value>45))throw Error('invalid_timeout');
  if(flag==='--limit'&&(!/^\d+$/.test(value)||+value>1000))throw Error('invalid_limit');
  if(flag==='--port'&&(!/^\d+$/.test(value)||+value<1024||+value>65535))throw Error('invalid_port');
  out.push(value);
 }
 if(['search','download'].includes(command)&&positional!==1)throw Error('missing_argument');
 return out;
}
export function needsApproval(command,args){return !(command==='search'||command==='messages'&&args.includes('--no-connect')&&!args.includes('--include-media'));}
export function syncSignal(command,result,cacheAsOf,prior=null){
 const observedAt=new Date().toISOString();
 if(command!=='sync')return {status:'cached-only',asOf:cacheAsOf,observedAt,lastAttempt:prior,sourceCoverage:'unverified'};
 const marker=result.stdout.match(/Final history event observed at: (\S+)/);
 const status=result.timedOut||result.stderr.includes('history_sync_timeout')?'timed-out':result.code===0&&marker&&!Number.isNaN(Date.parse(marker[1]))?'completed':'error';
 return {status,asOf:status==='completed'?marker[1]:cacheAsOf,observedAt,sourceCoverage:'unverified'};
}
export function publicOutput(raw){
 const start=raw.search(/(?:^|\n)[\[{]/);const candidate=start>=0?raw.slice(start).trim():raw;
 try {const parsed=JSON.parse(candidate);return JSON.parse(JSON.stringify(parsed,(key,value)=>['media','mediaKey','directPath','url'].includes(key)?undefined:value));}
 catch{return /"(?:mediaKey|directPath)"\s*:/.test(raw)?'[Output withheld: unstructured media credentials]':raw.slice(0,128000);}
}
export function runProcess(binary,command,args,home,timeoutMs=55000,onProgress=()=>{}){
 return new Promise(resolve=>{
  let stdout='',stderr='',timedOut=false,overflow=false;
  const child=spawn(process.execPath,[binary,command,...args],{cwd:path.join(home,'media'),env:{PATH:process.env.PATH,HOME:home,TMPDIR:path.join(home,'tmp')},stdio:['ignore','pipe','pipe'],detached:true});
  const kill=()=>{try{process.kill(-child.pid,'SIGTERM');}catch{}};
  const timer=setTimeout(()=>{timedOut=true;kill();},timeoutMs);
  const hard=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},timeoutMs+2000);
  for(const [stream,key] of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream.on('data',chunk=>{
   if(stdout.length+stderr.length>1000000){overflow=true;kill();return;}
   if(key==='stdout'){stdout+=chunk;onProgress(stdout);}else stderr+=chunk;
  });
  child.on('error',()=>{clearTimeout(timer);clearTimeout(hard);resolve({code:1,stdout:'',stderr:'spawn_error',timedOut:false});});
  child.on('close',code=>{clearTimeout(timer);clearTimeout(hard);resolve({code:overflow?1:code,stdout:overflow?'':stdout,stderr:overflow?'output_limit':stderr,timedOut});});
 });
}
