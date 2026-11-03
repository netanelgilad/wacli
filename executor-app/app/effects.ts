// Audited against vendor/wacli/src/cli.ts and client.ts. Maintenance is scoped
// to the selected app-owned HOME; it is not permission to pair/remove a device.
export function effectsFor(command: string, args: readonly string[] = []) {
 const flags = new Set(args.filter(a => a.startsWith('--')).map(a => a.split('=')[0]));
 const effects: string[] = [];
 switch (command) {
  case 'account': case 'messagesCached': case 'search': effects.push('cached-monitoring-read'); break;
  case 'jobStatus': effects.push('monitoring-job-read'); if (args[1] === 'pairing-output') effects.push('pairing-material-disclosure'); break;
  case 'messages':
   effects.push('cached-monitoring-read');
   if (!flags.has('--no-connect')) effects.push('upstream-monitoring-read','scoped-cache-write','session-maintenance');
   if (flags.has('--include-media')) effects.push('media-file-write');
   break;
  case 'status': case 'chats': case 'groups': case 'sync': case 'listen':
   effects.push('upstream-monitoring-read','scoped-cache-write','session-maintenance');break;
  case 'download': effects.push('upstream-media-read','media-file-write','session-maintenance');break;
  case 'link': effects.push('account-pairing');if(flags.has('--serve')) effects.push('public-qr-disclosure');break;
  case 'unlink': effects.push('session-removal','cache-deletion');break;
  default: throw Error('Unknown effect surface');
 }
 const gated = effects.some(e => ['media-file-write','account-pairing','public-qr-disclosure','session-removal','cache-deletion','pairing-material-disclosure'].includes(e));
 return {effects,requiresApproval:gated,scope:'selected-account-app-owned-home'};
}
