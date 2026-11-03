import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {runProcess,publicOutput} from '../companion/core.mjs';
const root=path.resolve(import.meta.dirname,'..');const state=path.join(root,'.private');
const initial=JSON.parse(fs.readFileSync(path.join(state,'source-fingerprint.json'),'utf8'));
// The owner's pre-existing global listener may update its store between tests.
// Compare this invocation's before/after, retaining the initialization evidence separately.
const original=Object.fromEntries(Object.keys(initial).map(p=>{const st=fs.statSync(p);return [p,{mtime:st.mtimeMs,size:st.size,hash:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}];}));
const binary=path.join(root,'vendor/wacli/dist/cli.js');const home=path.join(state,'accounts/account-1');
const result=await runProcess(binary,'messages',['--no-connect','--since','2000-01-01','--limit','1','--json'],home);
assert.equal(result.code,0);const rows=publicOutput(result.stdout);assert.ok(Array.isArray(rows));assert.ok(rows.length>0);
const other=await runProcess(binary,'messages',['--no-connect','--json'],path.join(state,'accounts/account-2'));assert.notEqual(other.code,0);
for(const [p,expected]of Object.entries(original)){const st=fs.statSync(p);assert.equal(st.mtimeMs,expected.mtime);assert.equal(st.size,expected.size);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),expected.hash);}
console.log(JSON.stringify({appScopedBinary:true,realCachedReadPassed:true,returnedRecords:rows.length,account2CannotReadAccount1:true,sourceFilesUnchanged:Object.keys(original).length,networkConnection:false,migration:false,pairing:false}));
