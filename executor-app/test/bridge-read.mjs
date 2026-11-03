import fs from 'node:fs';import assert from 'node:assert/strict';
const config=JSON.parse(fs.readFileSync(new URL('../.private/accounts.json',import.meta.url),'utf8'));
const url='http://127.0.0.1:18871/v1/call';
async function call(key,body,headers={}){return fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+config.accounts[key].token,...headers},body:JSON.stringify(body)});}
assert.equal((await fetch(url)).status,401);
assert.equal((await call('account-1',{account:'account-2',command:'account'})).status,403);
assert.equal((await call('account-2',{account:'account-1',command:'account'})).status,403);
assert.equal((await call('account-1',{account:'account-1',command:'sync',args:[]})).status,403);
const r=await call('account-1',{account:'account-1',command:'messages',args:['--no-connect','--since','2000-01-01','--limit','1','--json']});assert.equal(r.status,200);const data=await r.json();assert.equal(data.ok,true);assert.equal(data.sync.status,'cached-only');assert.ok(data.sync.asOf);assert.equal(data.output.length,1);
console.log(JSON.stringify({httpAuthenticationPassed:true,accountTokenIsolationPassed:true,unapprovedSyncBlocked:true,realHttpCachedReadPassed:true,status:data.sync.status,asOf:data.sync.asOf}));
