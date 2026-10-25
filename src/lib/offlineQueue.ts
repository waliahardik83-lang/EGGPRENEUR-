/**
 * Minimal offline write queue.
 *
 * Scope/limitations (stated honestly rather than oversold):
 * - Covers simple INSERT/UPDATE calls issued through `queuedWrite()`.
 * - Queue lives in localStorage, flushed on reconnect and on app start.
 * - No conflict resolution: if the same row was edited elsewhere while
 *   offline, the queued write will simply overwrite it on flush
 *   (last-write-wins). For a family-run MVP with one editor at a time this
 *   is an acceptable starting point, NOT a general sync engine.
 * - File uploads (evidence photos) are NOT queued — they require a
 *   network connection at upload time in this MVP.
 * - This has not been tested against real network interruptions in this
 *   delivery environment (no network access here). Test manually per
 *   TESTING.md before relying on it.
 */
import { supabase } from './supabaseClient';

type QueuedOp = {
  id: string;
  table: string;
  op: 'insert' | 'update' | 'upsert';
  payload: Record<string, unknown>;
  match?: Record<string, unknown>; // required for 'update'
  queuedAt: string;
};

const STORAGE_KEY = 'eggpreneur_offline_queue_v1';

function readQueue(): QueuedOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedOp[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedOp[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function getPendingCount(): number {
  return readQueue().length;
}

export async function queuedWrite(op: Omit<QueuedOp, 'id' | 'queuedAt'>): Promise<{ queued: boolean; error?: string }> {
  if (navigator.onLine) {
    const result = await executeOp(op);
    if (!result.error) return { queued: false };
    // fall through to queue on failure too, in case it was a transient network blip
  }
  const queue = readQueue();
  queue.push({ ...op, id: crypto.randomUUID(), queuedAt: new Date().toISOString() });
  writeQueue(queue);
  return { queued: true };
}

async function executeOp(op: Omit<QueuedOp, 'id' | 'queuedAt'>): Promise<{ error?: string }> {
  try {
    if (op.op === 'insert') {
      const { error } = await supabase.from(op.table).insert(op.payload);
      return { error: error?.message };
    }
    if (op.op === 'upsert') {
      const { error } = await supabase.from(op.table).upsert(op.payload);
      return { error: error?.message };
    }
    if (op.op === 'update' && op.match) {
      const { error } = await supabase.from(op.table).update(op.payload).match(op.match);
      return { error: error?.message };
    }
    return { error: 'Invalid queued operation' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function flushQueue(onProgress?: (remaining: number) => void): Promise<{ flushed: number; failed: number }> {
  if (!navigator.onLine) return { flushed: 0, failed: 0 };
  const queue = readQueue();
  let flushed = 0;
  let failed = 0;
  const remaining: QueuedOp[] = [];

  for (const item of queue) {
    const { error } = await executeOp(item);
    if (error) {
      failed += 1;
      remaining.push(item);
    } else {
      flushed += 1;
    }
    onProgress?.(remaining.length);
  }

  writeQueue(remaining);
  return { flushed, failed };
}

export function initOfflineSync() {
  window.addEventListener('online', () => {
    void flushQueue();
  });
}
