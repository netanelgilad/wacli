import {defineApp,defineProvider,object,string,array,json,secrets,plain,query,mutation,router,userInterval,type MutationContext,type QueryContext} from 'apps';
import {always} from 'apps/operations/approval';
const bridge=defineProvider({
 name:'WhatsApp Mac companion v1',hosts:['host.lima.internal:18871'],
 auth:{token:secrets({label:'Local companion account',fields:object({account:plain(string()),token:string()})})},
});
const requirements={app:{accounts:{whatsapp:bridge.many()}}};
type Context=QueryContext<typeof requirements>;
const Input=object({account:string({minLength:1}),args:array(string()).default([])});
async function invoke(ctx:Context,input:{account:string,args?:readonly string[]},command:string,approved=false){
 const account=ctx.app.accounts.whatsapp.find(a=>a.fields.account===input.account);
 if(!account)throw Error('Account not connected. Connect this account through Executor first.');
 const response=await ctx.fetch('http://host.lima.internal:18871/v1/call',{method:'POST',signal:ctx.signal,headers:{'content-type':'application/json',authorization:`Bearer ${account.fields.token}`,...(approved?{'x-executor-approved':'true'}:{})},body:JSON.stringify({account:input.account,command,args:input.args??[]})});
 if(!response.ok)throw Error(`Companion refused request (${response.status})`);
 return await response.json();
}
const gated=(command:string,description:string)=>mutation({input:Input,output:json(),approval:always(),description},(ctx:MutationContext<typeof requirements>,input)=>invoke(ctx,input,command,true));
const sync=gated('sync','Sync this account; approval required every run. args: --timeout 1..45. Completion requires a persisted final history event; coverage remains unverified.');
export default defineApp(requirements,{
 tools:router({
  account:query({input:object({account:string()}),output:json(),description:'Inspect selected account identity and cached-only status with as-of timestamp; does not connect to WhatsApp.'},(ctx,input)=>invoke(ctx,input,'account')),
  jobStatus:query({input:object({account:string(),job:string()}),output:json(),description:'Poll this account pairing/listener job. May contain private QR material; never log or publish it.'},(ctx,input)=>invoke(ctx,{account:input.account,args:[input.job]},'jobStatus')),
  messagesCached:query({input:Input,output:json(),description:'Read cached messages without connecting. All messages flags except --include-media; no migration or implicit sync.'},(ctx,input)=>{
   if(input.args.some(a=>a==='--include-media'||a.startsWith('--include-media=')))throw Error('Use approval-gated messages for media');
   return invoke(ctx,{...input,args:[...input.args.filter(a=>a!=='--no-connect'),'--no-connect']},'messages');
  }),
  search:query({input:Input,output:json(),description:'Cached text search. args: query, --since, --limit, --json.'},(ctx,input)=>invoke(ctx,input,'search')),
  link:gated('link','Start a five-minute pairing job; poll jobStatus for the QR code or serve URL. Link the selected isolated account with a QR code. HUMAN APPROVAL REQUIRED. args: --serve, --port. Never invoke for testing.'),
  unlink:gated('unlink','Delete selected account session and cache. DESTRUCTIVE; HUMAN APPROVAL REQUIRED. Never invoke for testing.'),
  status:gated('status','Connect and inspect upstream status; writes account session/cache, so approval required. This does not establish sync completion.'),
  sync,
  chats:gated('chats','Connect and list chats. args: --groups, --dms, --json. Approval required for session/cache writes.'),
  groups:gated('groups','Connect and list groups. args: --json. Approval required.'),
  messages:gated('messages','Full wacli messages parity: --chat, --groups, --dms, --since, --until, --sender, --search, --limit, --json, --no-connect, --include-media, --media-dir. Approval required; output paths stay within this account.'),
  download:gated('download','Download media: messageId, -o/--output, --json. Approval required; output paths confined to this account media directory.'),
  listen:gated('listen','Start a listener job; poll jobStatus for output. Listen for up to 60 seconds; args: --quiet. Approval required. Each new listen window requires approval; timeout is not sync success.'),
 },{instructions:'Every tool requires an explicit account (account-1 or account-2). Do not infer phone identities from slot numbers. Inspect account first. All connected, write, media, pairing and destructive operations require approval. Never claim cached reads or a connection mean history sync completed. Never accept an approval on behalf of a human. No send command exists in this wacli version.'}),
 schedules:{account1Sync:userInterval({minutes:15},sync,{account:'account-1',args:['--timeout','30']}),account2Sync:userInterval({minutes:15},sync,{account:'account-2',args:['--timeout','30']})},
});
