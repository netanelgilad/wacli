// Read-only source snapshot; never run the global wacli executable.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');const state=path.join(root,'.private');
fs.mkdirSync(state,{recursive:true,mode:0o700});
const configPath=path.join(state,'accounts.json');if(fs.existsSync(configPath))throw Error('Already initialized; refusing overwrite');
const source=path.join(os.homedir(),'.config/wacli');
function snapshot(dir){const out={};for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('Source symlink refused');if(item.isDirectory())Object.assign(out,snapshot(p));else{const st=fs.statSync(p);out[p]={hash:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),size:st.size,mtime:st.mtimeMs};}}return out;}
const before=snapshot(source);const accounts={};
for(const id of ['account-1','account-2']){
 const home=path.join(state,'accounts',id);fs.mkdirSync(path.join(home,'.config/wacli'),{recursive:true,mode:0o700});
 for(const dir of ['media','tmp'])fs.mkdirSync(path.join(home,dir),{mode:0o700});
 accounts[id]={id,token:crypto.randomBytes(32).toString('hex'),...(id==='account-1'?{monitoringSource:path.join(source,'data/messages.json')}:{})};
 if(id==='account-1')fs.cpSync(source,path.join(home,'.config/wacli'),{recursive:true,preserveTimestamps:true});
}
const after=snapshot(source);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Source changed during snapshot; verification failed');
fs.writeFileSync(path.join(state,'source-fingerprint.json'),JSON.stringify(before),{mode:0o600});
fs.writeFileSync(configPath,JSON.stringify({bind:'0.0.0.0',port:18871,accounts}),{mode:0o600});
const creds=JSON.parse(fs.readFileSync(path.join(source,'auth/creds.json'),'utf8'));const jid=creds.me?.id??null;
const digits=jid?.split('@')[0].split(':')[0];
console.log(JSON.stringify({snapshotVerified:true,sourceFiles:Object.keys(before).length,account1Identity:digits?'number ending '+digits.slice(-4):'unresolved',identitySource:'creds.me.id',networkVerified:false,account2:'unlinked; identity unresolved'}));
