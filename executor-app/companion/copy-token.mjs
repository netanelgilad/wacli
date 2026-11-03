import fs from 'node:fs';import {spawnSync} from 'node:child_process';
const id=process.argv[2];if(!['account-1','account-2'].includes(id))throw Error('Specify account-1 or account-2');
const config=JSON.parse(fs.readFileSync(new URL('../.private/accounts.json',import.meta.url),'utf8'));
const r=spawnSync('/usr/bin/pbcopy',[],{input:config.accounts[id].token});if(r.status!==0)throw Error('Clipboard copy failed');
console.log('Token copied to the local clipboard. Paste only into Executor secure connection form, then clear the clipboard.');
