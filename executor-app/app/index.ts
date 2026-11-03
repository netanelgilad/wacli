import {defineApp,defineProvider,object,string,array,json,boolean,secrets,query,mutation,router,userInterval,type MutationContext,type QueryContext} from 'apps';
import {effectsFor} from './effects';
const bridge=defineProvider({
 name:'WhatsApp Mac companion v1',hosts:['host.lima.internal:18871'],
 auth:{token:secrets({label:'Local companion account',fields:object({token:string()})})},
});
const requirements={app:{accounts:{whatsapp:bridge}}};
type Context=QueryContext<typeof requirements>;
const Input=object({args:array(string()).default([])});
async function invoke(ctx:Context,input:{args?:readonly string[]},command:string,approved=false){
 const account=ctx.app.accounts.whatsapp;
 if(!account)throw Error('The WhatsApp connection is unavailable.');
 const response=await ctx.fetch('http://host.lima.internal:18871/v1/call',{method:'POST',signal:ctx.signal,headers:{'content-type':'application/json',authorization:`Bearer ${account.fields.token}`,...(approved?{'x-executor-approved':'true'}:{})},body:JSON.stringify({command,args:input.args??[]})});
 if(!response.ok)throw Error(`Companion refused request (${response.status})`);
 return await response.json();
}
const operation=(command:string,description:string)=>mutation({input:Input,output:json(),approval:({toolInput})=>effectsFor(command,toolInput.args).requiresApproval?'user-approval':'approved',description},(ctx:MutationContext<typeof requirements>,input)=>invoke(ctx,input,command,effectsFor(command,input.args).requiresApproval));
const sync=operation('sync','Unattended monitoring sync. Borrowed sessions refresh the original cache read-only and report cached-only; independently paired accounts can sync upstream. args: --timeout 1..45. Completion requires a persisted final history event; coverage remains unverified.');
export default defineApp(requirements,{
 tools:router({
  account:query({input:object({}),output:json(),description:'Inspect WhatsApp identity and cached-only status with as-of timestamp; does not connect to WhatsApp.'},(ctx,input)=>invoke(ctx,input,'account')),
  jobStatus:query({input:object({job:string(),includePairingMaterial:boolean().default(false)}),output:json(),approval:({toolInput})=>toolInput.includePairingMaterial?'user-approval':'approved',description:'Read monitoring job output unattended. Pairing output is hidden unless includePairingMaterial=true, which requires approval.'},(ctx,input)=>invoke(ctx,{args:[input.job,...(input.includePairingMaterial?['pairing-output']:[])]},'jobStatus',input.includePairingMaterial)),
  messagesCached:query({input:Input,output:json(),description:'Read cached messages without connecting. All messages flags except --include-media; no migration or implicit sync.'},(ctx,input)=>{
   if(input.args.some(a=>a==='--include-media'||a.startsWith('--include-media=')))throw Error('Use approval-gated messages for media');
   return invoke(ctx,{...input,args:[...input.args.filter(a=>a!=='--no-connect'),'--no-connect']},'messages');
  }),
  search:query({input:Input,output:json(),description:'Cached text search. args: query, --since, --limit, --json.'},(ctx,input)=>invoke(ctx,input,'search')),
  link:operation('link','Start a five-minute pairing job; poll jobStatus for the QR code or serve URL. Pair WhatsApp with a QR code. HUMAN APPROVAL REQUIRED. args: --serve, --port. Never invoke for testing.'),
  unlink:operation('unlink','Delete the WhatsApp session and cache. DESTRUCTIVE; HUMAN APPROVAL REQUIRED. Never invoke for testing.'),
  status:operation('status','Connect and inspect upstream status; maintains only the selected app-owned session/cache; unattended. This does not establish sync completion.'),
  sync,
  chats:operation('chats','Connect and list chats. args: --groups, --dms, --json. Scoped session/cache maintenance runs unattended.'),
  groups:operation('groups','Connect and list groups. args: --json. Scoped monitoring runs unattended.'),
  messages:operation('messages','Full wacli messages parity: --chat, --groups, --dms, --since, --until, --sender, --search, --limit, --json, --no-connect, --include-media, --media-dir. Ordinary monitoring is unattended; --include-media requires approval. Output paths stay within this account.'),
  download:operation('download','Download media: messageId, -o/--output, --json. Approval required; output paths confined to this account media directory.'),
  listen:operation('listen','Start a listener job; poll jobStatus for output. Listen for up to 60 seconds; args: --quiet. Bounded monitoring is unattended; borrowed sessions poll their read-only source cache every 5 seconds; timeout is not sync success.'),
 },{instructions:'Inspect WhatsApp identity and cache freshness with account. Read cached messages with messagesCached or search. Use sync to refresh monitoring data and jobStatus to inspect bounded background jobs. Routine monitoring reads and sync run unattended within the connected WhatsApp scope. Media file writes, pairing/removal, public QR serving and pairing-material disclosure require approval. No forwarding or arbitrary filesystem targets are supported. Never claim cached reads or a connection mean history sync completed. Never accept an approval on behalf of a human. No send command exists in this wacli version.'}),
 schedules:{monitoringSync:userInterval({minutes:15},sync,{args:['--timeout','30']})},
});
