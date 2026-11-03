import test from 'node:test';
import assert from 'node:assert/strict';
import { HistorySyncTimeoutError, HistorySyncTracker, formatHistorySyncFailure, formatHistorySyncSuccess,
  parseSyncTimeoutSeconds, recordHistoryBatch, runBoundedHistorySync, type SyncClient } from '../src/history-sync.js';

test('only a final history event yields a timestamped completion, without claiming source coverage', async () => {
  const tracker = new HistorySyncTracker();
  const pending = tracker.wait(1000);
  tracker.markFinalEvent(new Date('2026-10-25T07:00:00.000Z'));
  assert.deepEqual(await pending, {
    status: 'final_history_event_observed',
    observedAt: '2026-10-25T07:00:00.000Z',
    sourceCoverage: 'unverified',
  });
  tracker.markFinalEvent(new Date('2026-10-25T08:00:00.000Z'));
  assert.equal((await tracker.wait(1)).observedAt, '2026-10-25T07:00:00.000Z');
  const output = formatHistorySyncSuccess(await tracker.wait(1), { chats: 2, messages: 3 });
  assert.match(output, /Status: final_history_event_observed/);
  assert.match(output, /2026-10-25T07:00:00.000Z/);
  assert.match(output, /Source coverage: unverified/);
  assert.doesNotMatch(output, /Sync complete!/);
});

test('a finite wait without the final event rejects instead of reporting success', async () => {
  const tracker = new HistorySyncTracker();
  await assert.rejects(tracker.wait(5), HistorySyncTimeoutError);
  assert.match(formatHistorySyncFailure(new HistorySyncTimeoutError(5)), /Status: history_sync_timeout/);
  const later = tracker.wait(1000);
  tracker.markFinalEvent(new Date('2026-10-25T07:01:00.000Z'));
  assert.equal((await later).observedAt, '2026-10-25T07:01:00.000Z');
});

test('history batches must process and persist before a final event can report success', async () => {
  const tracker = new HistorySyncTracker();
  let completed = false;
  const pending = tracker.wait(1000).then(result => { completed = true; return result; });
  const sequence: string[] = [];
  recordHistoryBatch(tracker, false, () => sequence.push('nonfinal-persisted'));
  await Promise.resolve();
  assert.equal(completed, false);
  recordHistoryBatch(tracker, true, () => {
    sequence.push('final-processed');
    sequence.push('final-persisted');
  });
  const result = await pending;
  assert.deepEqual(sequence, ['nonfinal-persisted', 'final-processed', 'final-persisted']);
  assert.equal(result.status, 'final_history_event_observed');

  const failed = new HistorySyncTracker();
  const failedWait = failed.wait(1000);
  recordHistoryBatch(failed, true, () => { throw new Error('synthetic persist failure'); });
  await assert.rejects(failedWait, /History sync processing failed/);
});

test('processing or connection errors reject pending and future waits', async () => {
  const tracker = new HistorySyncTracker();
  const pending = tracker.wait(1000);
  tracker.fail(new Error('synthetic connection failure'));
  await assert.rejects(pending, /synthetic connection failure/);
  await assert.rejects(tracker.wait(1000), /synthetic connection failure/);
  assert.match(formatHistorySyncFailure(new Error('synthetic connection failure')), /Status: history_sync_error/);
  tracker.markFinalEvent();
  await assert.rejects(tracker.wait(1000), /synthetic connection failure/);
});

test('sync timeout input is finite and bounded before any connection', () => {
  assert.equal(parseSyncTimeoutSeconds('1'), 1);
  assert.equal(parseSyncTimeoutSeconds('30'), 30);
  assert.equal(parseSyncTimeoutSeconds('45'), 45);
  for (const invalid of ['0', '46', '999', '-1', '2.5', 'abc', 'NaN', 'Infinity', '']) {
    assert.throws(() => parseSyncTimeoutSeconds(invalid), /sync_timeout_invalid/);
  }
});

test('bounded sync command cleans up after success, timeout, connection error and cleanup error', async () => {
  const sync = { status: 'final_history_event_observed' as const, observedAt: '2026-10-25T07:00:00.000Z', sourceCoverage: 'unverified' as const };
  const events: string[] = [];
  const client: SyncClient = {
    connect: async () => { events.push('connect'); },
    waitForSync: async timeoutMs => { events.push(`wait:${timeoutMs}`); return sync; },
    getChatCount: () => { events.push('chats'); return 2; },
    getMessageCount: () => { events.push('messages'); return 3; },
    disconnect: async () => { events.push('disconnect'); },
  };
  assert.deepEqual(await runBoundedHistorySync(client, 30), { sync, counts: { chats: 2, messages: 3 } });
  assert.deepEqual(events, ['connect', 'wait:30000', 'chats', 'messages', 'disconnect']);

  let disconnects = 0;
  const timedOut: SyncClient = { ...client,
    waitForSync: async () => { throw new HistorySyncTimeoutError(1000); },
    disconnect: async () => { disconnects++; },
  };
  await assert.rejects(runBoundedHistorySync(timedOut, 1), HistorySyncTimeoutError);
  assert.equal(disconnects, 1);

  const connectionError: SyncClient = { ...client,
    connect: async () => { throw new Error('synthetic connection failure'); },
    disconnect: async () => { disconnects++; },
  };
  await assert.rejects(runBoundedHistorySync(connectionError, 1), /synthetic connection failure/);
  assert.equal(disconnects, 2);

  const cleanupError: SyncClient = { ...client, disconnect: async () => { throw new Error('synthetic cleanup failure'); } };
  await assert.rejects(runBoundedHistorySync(cleanupError, 1), /History sync cleanup failed/);
  await assert.rejects(runBoundedHistorySync(client, 46), /sync_timeout_invalid/);
});
