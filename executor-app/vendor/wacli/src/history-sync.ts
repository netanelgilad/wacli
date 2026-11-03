// This signal records receipt of WhatsApp's final history batch in this
// connection. It does not establish that every expected chat has coverage.
export interface HistorySyncResult {
  status: 'final_history_event_observed';
  observedAt: string;
  sourceCoverage: 'unverified';
}

export class HistorySyncTimeoutError extends Error {
  readonly code = 'history_sync_timeout';

  constructor(timeoutMs: number) {
    super(`No final history event within ${timeoutMs} ms`);
    this.name = 'HistorySyncTimeoutError';
  }
}

type Waiter = {
  resolve: (result: HistorySyncResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class HistorySyncTracker {
  private result: HistorySyncResult | null = null;
  private failure: Error | null = null;
  private waiters = new Set<Waiter>();

  markFinalEvent(at: Date = new Date()): void {
    if (this.result || this.failure) return;
    this.result = { status: 'final_history_event_observed', observedAt: at.toISOString(), sourceCoverage: 'unverified' };
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(this.result);
    }
    this.waiters.clear();
  }

  fail(error: Error): void {
    if (this.result || this.failure) return;
    this.failure = error;
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters.clear();
  }

  wait(timeoutMs: number): Promise<HistorySyncResult> {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) return Promise.reject(new Error('invalid_history_sync_timeout'));
    if (this.result) return Promise.resolve(this.result);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        resolve, reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new HistorySyncTimeoutError(timeoutMs));
        }, timeoutMs),
      };
      this.waiters.add(waiter);
    });
  }
}

export function recordHistoryBatch(tracker: HistorySyncTracker, isLatest: boolean, processAndPersist: () => void): void {
  try {
    processAndPersist();
    if (isLatest) tracker.markFinalEvent();
  } catch {
    tracker.fail(new Error('History sync processing failed'));
  }
}

export function parseSyncTimeoutSeconds(value: string): number {
  if (!/^[1-9]\d?$/.test(value)) throw new Error('sync_timeout_invalid: use 1-45 seconds');
  const seconds = Number(value);
  if (seconds > 45) throw new Error('sync_timeout_invalid: use 1-45 seconds');
  return seconds;
}

export interface SyncClient {
  connect(options: { syncHistory: true }): Promise<void>;
  waitForSync(timeoutMs: number): Promise<HistorySyncResult>;
  getChatCount(): number;
  getMessageCount(): number;
  disconnect(): Promise<void>;
}

export async function runBoundedHistorySync(client: SyncClient, timeoutSeconds: number): Promise<{
  sync: HistorySyncResult;
  counts: { chats: number; messages: number };
}> {
  const timeoutMs = parseSyncTimeoutSeconds(String(timeoutSeconds)) * 1000;
  let attemptedConnection = false;
  let result: { sync: HistorySyncResult; counts: { chats: number; messages: number } } | undefined;
  let failure: unknown;
  try {
    attemptedConnection = true;
    await client.connect({ syncHistory: true });
    const sync = await client.waitForSync(timeoutMs);
    result = { sync, counts: { chats: client.getChatCount(), messages: client.getMessageCount() } };
  } catch (error) {
    failure = error;
  }
  if (attemptedConnection) {
    try {
      await client.disconnect();
    } catch {
      if (!failure) failure = new Error('History sync cleanup failed');
    }
  }
  if (failure) throw failure;
  return result!;
}

export function formatHistorySyncSuccess(result: HistorySyncResult, counts: { chats: number; messages: number }): string {
  return [
    `✅ Status: ${result.status}`,
    `   Final history event observed at: ${result.observedAt}`,
    `   Source coverage: ${result.sourceCoverage} (this signal does not prove every expected chat is present)`,
    `   Chats: ${counts.chats}`,
    `   Messages: ${counts.messages}`,
  ].join('\n');
}

export function formatHistorySyncFailure(error: unknown): string {
  const status = error instanceof HistorySyncTimeoutError ? 'history_sync_timeout' : 'history_sync_error';
  const detail = error instanceof Error ? error.message : 'unknown failure';
  return `❌ Status: ${status}; ${detail}`;
}
