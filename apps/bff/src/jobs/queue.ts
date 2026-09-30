export interface Delivery<T> {
  message: T;
  /** 1 on first delivery, then 2, 3, ... like SQS's ApproximateReceiveCount. */
  attempt: number;
}

export type MessageHandler<T> = (delivery: Delivery<T>) => Promise<void>;

/**
 * The seam between "accept the work" and "do the work". Swap InMemoryJobQueue for SQS (a
 * visibility timeout for retries, a redrive policy to a dead-letter queue) or for an outbox
 * table plus a relay, and the routes and the worker don't change.
 */
export interface JobQueue<T> {
  publish(message: T): Promise<void>;
  subscribe(handler: MessageHandler<T>): void;
}

/**
 * Delivers each message asynchronously. If the handler throws, it redelivers after an
 * exponential backoff (retryBaseMs, 2x, 4x, ...). After maxAttempts failures the message moves
 * to `deadLetters` for a human to inspect, instead of retrying forever.
 */
export class InMemoryJobQueue<T> implements JobQueue<T> {
  readonly deadLetters: T[] = [];
  readonly #maxAttempts: number;
  readonly #retryBaseMs: number;
  #handler: MessageHandler<T> | undefined;

  constructor({ maxAttempts, retryBaseMs }: { maxAttempts: number; retryBaseMs: number }) {
    this.#maxAttempts = maxAttempts;
    this.#retryBaseMs = retryBaseMs;
  }

  async publish(message: T): Promise<void> {
    this.#schedule(message, 1, 0);
  }

  subscribe(handler: MessageHandler<T>): void {
    this.#handler = handler;
  }

  #schedule(message: T, attempt: number, delayMs: number): void {
    setTimeout(() => void this.#deliver(message, attempt), delayMs);
  }

  async #deliver(message: T, attempt: number): Promise<void> {
    try {
      if (!this.#handler) throw new Error('The queue has no subscriber.');
      await this.#handler({ message, attempt });
    } catch {
      if (attempt >= this.#maxAttempts) {
        this.deadLetters.push(message);
      } else {
        this.#schedule(message, attempt + 1, this.#retryBaseMs * 2 ** (attempt - 1));
      }
    }
  }
}
