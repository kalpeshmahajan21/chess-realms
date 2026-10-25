import { ChessEngine, Move, PieceType } from './chess.ts';
import { getAIMove } from './aiEngine.ts';
import type { AIDifficulty } from '../types.ts';
import type { AIRequest, AIResponse } from './ai.worker.ts';

/**
 * Runs AI searches off the main thread so rendering never stalls.
 * Falls back to an in-thread search if Workers are unavailable.
 */
class AIClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: AIResponse) => void>();
  private workerFailed = false;

  private getWorker(): Worker | null {
    if (this.workerFailed || typeof Worker === 'undefined') return null;
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent<AIResponse>) => {
          const resolve = this.pending.get(e.data.id);
          this.pending.delete(e.data.id);
          resolve?.(e.data);
        };
        this.worker.onerror = () => {
          this.workerFailed = true;
          this.worker?.terminate();
          this.worker = null;
          // Resolve anything in flight as "no move"; callers retry on the main thread.
          this.pending.forEach(resolve => resolve({ id: -1, from: -1, to: -1, error: 'worker failed' }));
          this.pending.clear();
        };
      } catch {
        this.workerFailed = true;
        return null;
      }
    }
    return this.worker;
  }

  /** Resolves with a legal move for the engine's current position (or null if none). */
  async findMove(engine: ChessEngine, difficulty: AIDifficulty, timeScale = 1): Promise<Move | null> {
    const legal = engine.generateLegalMoves();
    if (legal.length === 0) return null;

    const worker = this.getWorker();
    let res: AIResponse | null = null;
    if (worker) {
      const id = this.nextId++;
      const request: AIRequest = { id, state: engine.state, difficulty, timeScale };
      res = await new Promise<AIResponse>(resolve => {
        this.pending.set(id, resolve);
        worker.postMessage(request);
      });
    }

    if (res?.error === 'cancelled') return null;
    if (!res || res.error || res.from < 0) {
      // Main-thread fallback, yielded so the current frame can finish first.
      await new Promise(r => setTimeout(r, 16));
      return getAIMove(engine, difficulty, timeScale);
    }

    return (
      legal.find(m => m.from === res!.from && m.to === res!.to && (m.promotion ?? undefined) === ((res!.promotion as PieceType) ?? undefined)) ||
      legal.find(m => m.from === res!.from && m.to === res!.to) ||
      null
    );
  }

  /** Discard results of any in-flight search (e.g. after undo or leaving the match). */
  cancelAll() {
    this.pending.forEach(resolve => resolve({ id: -1, from: -1, to: -1, error: 'cancelled' }));
    this.pending.clear();
  }
}

export const aiClient = new AIClient();
