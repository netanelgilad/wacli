// Real account monitoring, no approval header. Never prints content or tokens.
import fs from 'node:fs';import assert from 'node:assert/strict';
const config=JSON.parse(fs.readFileSync(new URL('../.private/accounts.json',import.meta.url),'utf8'));
const response=await fetch('http://127.0.0.1:18871/v1/call',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+config.accounts['account-1'].token},body:JSON.stringify({account:'account-1',command:'sync',args:['--timeout','5']})});
assert.equal(response.status,200);const result=await response.json();
assert.ok(['completed','timed-out','cached-only','error'].includes(result.sync.status));assert.ok(result.sync.observedAt);
const report={unattended:true,approvalHeader:false,httpStatus:response.status,ok:result.ok,sync:result.sync,error:result.error};
fs.writeFileSync(new URL('../.private/round1-sync-evidence.json',import.meta.url),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
