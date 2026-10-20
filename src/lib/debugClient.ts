// Browser client for `zut host`'s CDP-backed Node debugger.
import type { HostConfig } from './host';

export interface DebugBreakpoint {
  path: string;
  line: number;
}

export interface DebugFrame {
  id: string;
  functionName: string;
  url: string;
  path: string;
  line: number;
  column: number;
}

export interface DebugVariable {
  name: string;
  type: string;
  value: string;
}

export interface DebugScope {
  type: string;
  variables: DebugVariable[];
}

export type DebugEvent =
  | { type: 'started'; entry: string; stopOnEntry: boolean }
  | { type: 'output'; stream: 'stdout' | 'stderr'; data: string }
  | { type: 'console'; level: string; text: string }
  | { type: 'script'; url: string; path: string; scriptId: string }
  | { type: 'breakpoints'; breakpoints: Array<DebugBreakpoint & { verified: boolean }> }
  | { type: 'paused'; reason: string; frames: DebugFrame[]; scopes: DebugScope[] }
  | { type: 'resumed' }
  | { type: 'exit'; code: number | null; signal: string | null }
  | { type: 'closed' };

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function debugUrl(config: HostConfig): string {
  const base = config.url.trim().replace(/\/+$/, '').replace(/^http/i, 'ws');
  const token = config.token ? `?token=${encodeURIComponent(config.token)}` : '';
  return `${base}/debug${token}`;
}

export class DebugClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(event: DebugEvent) => void>();
  private queued: string[] = [];
  readonly ready: Promise<void>;

  constructor(config: HostConfig) {
    this.ws = new WebSocket(debugUrl(config));
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Debugger connection timed out.')), 10_000);
      this.ws.onopen = () => {
        clearTimeout(timer);
        for (const message of this.queued) this.ws.send(message);
        this.queued = [];
        resolve();
      };
      this.ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Could not reach the host debugger.'));
      };
    });
    this.ws.onmessage = (event) => this.receive(event.data);
    this.ws.onclose = () => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error('Debugger disconnected.'));
      }
      this.pending.clear();
      this.dispatch({ type: 'closed' });
    };
  }

  onEvent(listener: (event: DebugEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private dispatch(event: DebugEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private receive(raw: unknown): void {
    let msg: Record<string, unknown> | null = null;
    try {
      msg = JSON.parse(String(raw)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!msg) return;
    if (msg.type === 'result' && typeof msg.id === 'number') {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.ok) pending.resolve(msg.result ?? msg);
      else pending.reject(new Error(String(msg.error ?? 'Debug command failed.')));
      return;
    }
    this.dispatch(msg as unknown as DebugEvent);
  }

  private send(payload: Record<string, unknown>, timeoutMs = 20_000): Promise<unknown> {
    const id = this.nextId++;
    const message = JSON.stringify({ ...payload, id });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Debugger timed out on ${String(payload.type)}.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(message);
      else if (this.ws.readyState === WebSocket.CONNECTING) this.queued.push(message);
      else {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error('Debugger is not connected.'));
      }
    });
  }

  start(entry: string, stopOnEntry = true): Promise<unknown> {
    return this.send({ type: 'start', entry, stopOnEntry });
  }

  setBreakpoints(breakpoints: DebugBreakpoint[]): Promise<unknown> {
    return this.send({ type: 'breakpoints', breakpoints });
  }

  command(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this.send({ type: 'command', command, args });
  }

  async evaluate(expression: string, frameId?: string): Promise<{ value: string; type: string }> {
    const result = (await this.send({ type: 'command', command: 'evaluate', args: { expression, frameId } })) as {
      result?: { value: string; type: string };
    };
    return result.result ?? { value: '', type: 'undefined' };
  }

  stop(): Promise<unknown> {
    return this.send({ type: 'stop' }, 6000);
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
}
