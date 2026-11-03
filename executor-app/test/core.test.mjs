import {test} from 'node:test';import assert from 'node:assert/strict';import {validate,needsApproval,syncSignal,publicOutput,commands} from '../companion/core.mjs';
test('all upstream commands represented; only offline reads ungated',()=>{
 assert.equal(Object.keys(commands).length,10);
 for(const cmd of Object.keys(commands))assert.equal(needsApproval(cmd,[]),cmd!=='search');
 assert.equal(needsApproval('messages',['--no-connect']),false);
 assert.equal(needsApproval('messages',['--no-connect','--include-media']),true);
});
test('account directories and media traversal are isolated',()=>{
 assert.deepEqual(validate('download',['id','-o','x'],'/a'),['id','-o','/a/media/x']);
 assert.deepEqual(validate('download',['id','-o','x'],'/b'),['id','-o','/b/media/x']);
 for(const p of ['../b/creds.json','/tmp/out','../../auth/creds.json'])assert.throws(()=>validate('download',['id','--output='+p],'/a'));
 assert.throws(()=>validate('messages',['--media-dir','../other'],'/a'));
});
test('unknown commands, flags, duplicate flags, positional injection rejected',()=>{
 for(const [c,a] of [['send',[]],['messages',['--eval','code']],['messages',['--no-connect=false']],['sync',['--timeout','46']],['messages',['--no-connect','--no-connect']],['search',['term','extra']]])assert.throws(()=>validate(c,a,'/a'));
 assert.deepEqual(validate('sync',['--timeout=30'],'/a'),['--timeout','30']);
});
test('completion requires success and final-event timestamp',()=>{
 const time='2026-11-03T12:00:00.000Z';const r={code:0,stdout:'Final history event observed at: '+time,stderr:'',timedOut:false};
 assert.equal(syncSignal('sync',r,null).status,'completed');
 assert.equal(syncSignal('sync',{...r,stdout:'Sync complete'},time).status,'error');
 assert.equal(syncSignal('sync',{...r,code:1},time).status,'error');
 assert.equal(syncSignal('sync',{...r,timedOut:true},time).status,'timed-out');
 assert.equal(syncSignal('sync',{...r,stderr:'history_sync_timeout',code:1},time).status,'timed-out');
 const cached=syncSignal('messages',r,time);assert.equal(cached.status,'cached-only');assert.equal(cached.asOf,time);
 assert.equal(syncSignal('account',{},null).asOf,null);
});
test('media credentials removed from JSON output',()=>{assert.deepEqual(publicOutput('[{"body":"hi","media":{"mediaKey":"secret"}}]'),[{body:'hi'}]);});
