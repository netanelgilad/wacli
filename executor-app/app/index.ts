import {defineApp,defineProvider,object,string,array,json,boolean,secrets,query,mutation,router,userInterval,type MutationContext,type QueryContext} from 'apps';
import {effectsFor} from './effects';
const bridge=defineProvider({
 name:'WhatsApp Mac companion v1',hosts:['host.lima.internal:18873'],
 auth:{token:secrets({label:'Local companion account',fields:object({token:string()})})},
});
const requirements={app:{accounts:{whatsapp:bridge.many()}}};
type Context=QueryContext<typeof requirements>;
const Input=object({connectionId:string().optional(),args:array(string()).default([])});
async function invoke(ctx:Context,input:{connectionId?:string,args?:readonly string[]},command:string,approved=false){
 const accounts=ctx.app.accounts.whatsapp;
 const account=input.connectionId?accounts.find(a=>a.id===input.connectionId):accounts.length===1?accounts[0]:undefined;
 if(!account)throw Error(input.connectionId?'That Executor connection is not linked to WhatsApp.':accounts.length?'Specify connectionId from connections when multiple connections are linked.':'Link a WhatsApp connection in Executor.');
 const response=await ctx.fetch('http://host.lima.internal:18873/whatsapp/v1/call',{method:'POST',signal:ctx.signal,headers:{'content-type':'application/json',authorization:`Bearer ${account.fields.token}`,...(approved?{'x-executor-approved':'true'}:{})},body:JSON.stringify({command,args:input.args??[]})});
 if(!response.ok)throw Error(`Companion refused request (${response.status})`);
 const {account:_localAccount,...result}=await response.json();
 return {...result,connectionId:account.id};
}
const operation=(command:string,description:string)=>mutation({input:Input,output:json(),approval:({toolInput})=>effectsFor(command,toolInput.args).requiresApproval?'user-approval':'approved',description},(ctx:MutationContext<typeof requirements>,input)=>invoke(ctx,input,command,effectsFor(command,input.args).requiresApproval));
const sync=operation('sync','Unattended monitoring sync. Borrowed sessions refresh the original cache read-only and report cached-only; independently paired accounts can sync upstream. args: --timeout 1..45. Completion requires a persisted final history event; coverage remains unverified.');
const syncAll=mutation({input:object({}),output:json(),approval:()=> 'approved',description:'Refresh monitoring caches for every linked connection, sequentially. No pairing or device removal; reports each connection separately.'},async (ctx:MutationContext<typeof requirements>)=>{const results:any[]=[];for(const a of ctx.app.accounts.whatsapp){try{results.push({connectionId:a.id,ok:true,result:await invoke(ctx,{connectionId:a.id,args:['--timeout','30']},'sync')});}catch{results.push({connectionId:a.id,ok:false,error:'monitoring_refresh_failed'});}}return {results};});
export default defineApp(requirements,{
 tools:router({
  connections:query({input:object({}),output:json(),description:'List linked Executor connection IDs. No WhatsApp network request.'},async (ctx:Context)=>({connections:ctx.app.accounts.whatsapp.map(a=>({connectionId:a.id})),default:ctx.app.accounts.whatsapp.length===1?ctx.app.accounts.whatsapp[0].id:null})),
  account:query({input:object({connectionId:string().optional()}),output:json(),description:'Inspect WhatsApp identity and cached-only status with as-of timestamp; does not connect to WhatsApp.'},(ctx,input)=>invoke(ctx,input,'account')),
  jobStatus:query({input:object({connectionId:string().optional(),job:string(),includePairingMaterial:boolean().default(false)}),output:json(),approval:({toolInput})=>toolInput.includePairingMaterial?'user-approval':'approved',description:'Read monitoring job output unattended. Pairing output is hidden unless includePairingMaterial=true, which requires approval.'},(ctx,input)=>invoke(ctx,{connectionId:input.connectionId,args:[input.job,...(input.includePairingMaterial?['pairing-output']:[])]},'jobStatus',input.includePairingMaterial)),
  messagesCached:query({input:Input,output:json(),description:'Read cached messages without connecting. All messages flags except --include-media; no migration or implicit sync.'},(ctx,input)=>{
   if(input.args.some(a=>a==='--include-media'||a.startsWith('--include-media=')))throw Error('Use approval-gated messages for media');
   return invoke(ctx,{...input,args:[...input.args.filter(a=>a!=='--no-connect'),'--no-connect']},'messages');
  }),
  search:query({input:Input,output:json(),description:'Cached text search. args: query, --since, --limit, --json.'},(ctx,input)=>invoke(ctx,input,'search')),
  link:operation('link','Start a five-minute pairing job; poll jobStatus for the QR code or serve URL. Pair WhatsApp with a QR code. HUMAN APPROVAL REQUIRED. args: --serve, --port. Never invoke for testing.'),
  unlink:operation('unlink','Delete the WhatsApp session and cache. DESTRUCTIVE; HUMAN APPROVAL REQUIRED. Never invoke for testing.'),
  status:operation('status','Connect and inspect upstream status; maintains only the selected app-owned session/cache; unattended. This does not establish sync completion.'),
  sync,
  syncAll,
  chats:operation('chats','Connect and list chats. args: --groups, --dms, --json. Scoped session/cache maintenance runs unattended.'),
  groups:operation('groups','Connect and list groups. args: --json. Scoped monitoring runs unattended.'),
  messages:operation('messages','Full wacli messages parity: --chat, --groups, --dms, --since, --until, --sender, --search, --limit, --json, --no-connect, --include-media, --media-dir. Ordinary monitoring is unattended; --include-media requires approval. Output paths stay within this account.'),
  download:operation('download','Download media: messageId, -o/--output, --json. Approval required; output paths confined to this account media directory.'),
  listen:operation('listen','Start a listener job; poll jobStatus for output. Listen for up to 60 seconds; args: --quiet. Bounded monitoring is unattended; borrowed sessions poll their read-only source cache every 5 seconds; timeout is not sync success.'),
 },{instructions:'Use connections to list native Executor connection IDs. A single linked connection is the default; with multiple links, supply connectionId to operate on one. Unknown IDs fail closed. Inspect WhatsApp identity and cache freshness with account. Read cached messages with messagesCached or search. Use sync to refresh monitoring data and jobStatus to inspect bounded background jobs. Routine monitoring reads and sync run unattended within the connected WhatsApp scope. Media file writes, pairing/removal, public QR serving and pairing-material disclosure require approval. No forwarding or arbitrary filesystem targets are supported. Never claim cached reads or a connection mean history sync completed. Never accept an approval on behalf of a human. No send command exists in this wacli version.'}),
 schedules:{monitoringSync:userInterval({minutes:15},syncAll,{})},
});
