import fs from 'node:fs';import path from 'node:path';
// Source is trusted deployment configuration, never supplied by a tool caller.
// Never writes, chmods, migrates or opens a WhatsApp connection against source.
export function refreshSnapshot(source,home){
 const before=fs.statSync(source);const raw=fs.readFileSync(source);const after=fs.statSync(source);
 if(before.mtimeMs!==after.mtimeMs||before.size!==after.size)throw Error('source_changed_during_read');
 const data=JSON.parse(raw.toString('utf8'));
 if(!data.messages||!data.chats)throw Error('source_cache_invalid');
 const destination=path.join(home,'.config/wacli/data/messages.json');
 fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
 const temp=destination+'.snapshot';fs.writeFileSync(temp,raw,{mode:0o600});fs.utimesSync(temp,after.atime,after.mtime);fs.renameSync(temp,destination);
 return {status:'cached-only',asOf:after.mtime.toISOString(),observedAt:new Date().toISOString(),sourceCoverage:'unverified',mode:'read-only-source-snapshot',upstreamSyncCompleted:false};
}
