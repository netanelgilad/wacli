import {test,expect} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createAppHandler,hostContext} from 'apps/host';
import app from '../index';
import {createWhatsAppServer} from '../../companion/server.mjs';

test('SDK-bound connection routes HTTP without account inputs and preserves isolation/approval',async()=>{
 const root=mkdtempSync(join(tmpdir(),'whatsapp-sdk-fixture-'));
 const first='synthetic-first-credential-'.repeat(3),second='synthetic-second-credential-'.repeat(3);
 let runs:string[]=[];
 const companion=createWhatsAppServer({root,config:{accounts:{first:{id:'first',token:first},second:{id:'second',token:second}}},readIdentity:()=>({jid:'synthetic',networkVerified:false}),runProcess:async(_binary:string,_command:string,_args:string[],home:string)=>{runs.push(home);return {code:0,stdout:'{}',stderr:'',timedOut:false};}});
 const originalFetch=globalThis.fetch;
 const handler=createAppHandler(app);
 async function dispatch(command:unknown,context=hostContext({app:{}})){
  const response=await handler(new Request('https://synthetic.invalid',{method:'POST',body:JSON.stringify(command)}),context);
  return response.json();
 }
 try{
  companion.listen(0,'127.0.0.1');await once(companion,'listening');
  const address=companion.address();assert.ok(address&&typeof address!=='string');
  const requirements=await dispatch({operation:'requirements'});
  const slot=requirements.value.accounts.app.whatsapp;
  expect(slot.cardinality).toBe('many');
  expect(Object.keys(slot.definition.auth.token.fields.properties)).toEqual(['token']);
  const bound=(token:string,id:string)=>({id,provider:slot.definition,method:'token',fields:{token}});
  const firstBound=bound(first,'acc_fixture_first'),secondBound=bound(second,'acc_fixture_second');
  const context=(token:string,id:string,approval?:unknown)=>hostContext({app:{whatsapp:[bound(token,id)]},user:{}},approval);
  const a=context(first,'acc_fixture_first'),b=context(second,'acc_fixture_second');
  const catalog=await dispatch({operation:'inspect'},a);
  expect(catalog.ok).toBe(true);expect(catalog.value.tools.length).toBe(15);
  for(const tool of catalog.value.tools){expect(tool.inputSchema.properties?.account).toBeUndefined();expect(JSON.stringify(tool)).not.toMatch(/account-[12]/);}
  expect(JSON.stringify(catalog.value.routers)).not.toMatch(/account-[12]|slot choice/);
  const schedules=catalog.value.tools.flatMap((tool:any)=>tool.schedules);
  expect(schedules.length).toBe(1);expect(JSON.stringify(schedules)).not.toMatch(/account-[12]|"account"/);
  expect(readFileSync(new URL('../skills/whatsapp/SKILL.md',import.meta.url),'utf8')).not.toMatch(/account-[12]|slot choice/);
  let outbound=0;
  globalThis.fetch=(async(input:any,init:any)=>{
   const request=new Request(input,init);
   expect(request.url).toBe('http://host.lima.internal:18873/whatsapp/v1/call');
   const text=await request.text(),body=JSON.parse(text);
   expect(Object.hasOwn(body,'account')).toBe(false);outbound++;
   return originalFetch(`http://127.0.0.1:${address.port}/v1/call`,{method:'POST',headers:request.headers,body:text,signal:request.signal});
  }) as typeof fetch;
  for(const [ctx,local] of [[a,'first'],[b,'second']] as const){
   const result=await dispatch({operation:'call',tool:'account',kind:'query',input:{}},ctx);
   expect(result.ok).toBe(true);expect(result.value.account).toBeUndefined();expect(result.value.connectionId).toBe(local==='first'?'acc_fixture_first':'acc_fixture_second');
   const search=await dispatch({operation:'call',tool:'search',kind:'query',input:{args:['synthetic-query']}},ctx);
   expect(search.ok).toBe(true);expect(search.value.account).toBeUndefined();expect(search.value.connectionId).toBe(local==='first'?'acc_fixture_first':'acc_fixture_second');
  }
  expect(runs).toEqual([join(root,'.private/accounts/first'),join(root,'.private/accounts/second')]);
  const many=hostContext({app:{whatsapp:[firstBound,secondBound]},user:{}});
  const listed=await dispatch({operation:'call',tool:'connections',kind:'query',input:{}},many);
  expect(listed.value.connections.map((x:any)=>x.connectionId)).toEqual(['acc_fixture_first','acc_fixture_second']);expect(listed.value.default).toBeNull();
  const before=outbound;
  for(const connectionId of [undefined,'first','acc_not_linked']){const refused=await dispatch({operation:'call',tool:'account',kind:'query',input:connectionId?{connectionId}:{}},many);expect(refused.ok).toBe(false);expect(outbound).toBe(before);}
  for(const connectionId of ['acc_fixture_second','acc_fixture_first']){const r=await dispatch({operation:'call',tool:'account',kind:'query',input:{connectionId}},many);expect(r.ok).toBe(true);expect(r.value.connectionId).toBe(connectionId);expect(r.value.account).toBeUndefined();}
  const empty=hostContext({app:{whatsapp:[]},user:{}});const missing=await dispatch({operation:'call',tool:'account',kind:'query',input:{}},empty);expect(missing.ok).toBe(false);
  for(const id of ['first','second'])mkdirSync(join(root,'.private/accounts',id),{recursive:true});
  const all=await dispatch({operation:'call',tool:'syncAll',kind:'mutation',input:{}},many);
  expect(all.ok).toBe(true);expect(all.value.results.map((x:any)=>({id:x.connectionId,ok:x.ok}))).toEqual([{id:'acc_fixture_first',ok:true},{id:'acc_fixture_second',ok:true}]);
  expect(runs.slice(-2)).toEqual([join(root,'.private/accounts/first'),join(root,'.private/accounts/second')]);
  const calls=outbound;
  const gated=await dispatch({operation:'call',tool:'download',kind:'mutation',input:{args:['synthetic-message']}},a);
  expect(gated.ok).toBe(false);expect(gated.error._tag).toBe('HostToolApprovalRequired');expect(outbound).toBe(calls);
  const pairing=await dispatch({operation:'call',tool:'jobStatus',kind:'query',input:{job:'synthetic',includePairingMaterial:true}},a);
  expect(pairing.ok).toBe(false);expect(pairing.error._tag).toBe('HostToolApprovalRequired');expect(outbound).toBe(calls);
  const injected=await dispatch({operation:'call',tool:'account',kind:'query',input:{account:'second'}},a);
  if(injected.ok)expect(injected.value.connectionId).toBe('acc_fixture_first');else expect(outbound).toBe(calls);
  // Direct legacy bodies cannot override the bearer-selected account.
  for(const [token,body,code] of [[first,{account:'second',command:'account'},403],[second,{account:'first',command:'account'},403],['invalid',{command:'account'},401],[first,{command:'download',args:['synthetic']},403]] as const){
   const r=await originalFetch(`http://127.0.0.1:${address.port}/v1/call`,{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify(body)});expect(r.status).toBe(code);await r.arrayBuffer();
  }
  expect(runs.length).toBe(4);
 }finally{globalThis.fetch=originalFetch;await new Promise<void>(r=>companion.close(()=>r()));rmSync(root,{recursive:true,force:true});}
});
