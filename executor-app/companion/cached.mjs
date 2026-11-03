import {loadStore} from '../vendor/wacli/dist/store.js';
const command=process.argv[2];const args=process.argv.slice(3);
if(command==='download'){
 const {client}=await import('../vendor/wacli/dist/client.js');
 const index=args.findIndex(a=>a==='-o'||a==='--output');
 const output=await client.downloadMedia(args[0],index>=0?args[index+1]:'./');
 console.log(JSON.stringify({success:true,path:output,messageId:args[0]}));
 process.exit(0);
}
const store=loadStore();
let chats=[...store.chats].map(([id,c])=>({id,...c,messageCount:store.messages.get(id)?.length??0}));
if(command==='groups'||args.includes('--groups'))chats=chats.filter(c=>c.isGroup);
else if(args.includes('--dms'))chats=chats.filter(c=>!c.isGroup);
chats.sort((a,b)=>b.lastMessageTime-a.lastMessageTime);
console.log(JSON.stringify(command==='status'?{connected:false,mode:'read-only-source-snapshot',chats:store.chats.size,messages:[...store.messages.values()].reduce((n,m)=>n+m.length,0)}:chats));
