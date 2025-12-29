/**
 * RingBuffer - Bounded circular buffer for time-series data
 *
 * A fixed-capacity buffer that overwrites oldest entries when full.
 * Optimized for debug sampling where we want the last N samples.
 */
export class RingBuffer<T> {
  private buffer: (T | undefined)[];
  private head: number = 0;
  private count: number = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array<T | undefined>(capacity);
  }

  /**
   * Add an item, overwriting oldest if at capacity.
   */
  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Get item at logical index (0 = oldest, count-1 = newest).
   */
  get(index: number): T | undefined {
    if (index < 0 || index >= this.count) {
      return undefined;
    }
    const start = (this.head - this.count + this.capacity) % this.capacity;
    const actualIndex = (start + index) % this.capacity;
    return this.buffer[actualIndex];
  }

  /**
   * Get the most recent item.
   */
  peek(): T | undefined {
    if (this.count === 0) return undefined;
    const lastIndex = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[lastIndex];
  }

  /**
   * Get all items in order (oldest to newest).
   */
  toArray(): T[] {
    if (this.count === 0) return [];

    const result: T[] = [];
    const start = (this.head - this.count + this.capacity) % this.capacity;

    for (let i = 0; i < this.count; i++) {
      const index = (start + i) % this.capacity;
      const item = this.buffer[index];
      if (item !== undefined) {
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Get items in reverse order (newest to oldest).
   */
  toArrayReversed(): T[] {
    if (this.count === 0) return [];

    const result: T[] = [];

    for (let i = 0; i < this.count; i++) {
      const index = (this.head - 1 - i + this.capacity) % this.capacity;
      const item = this.buffer[index];
      if (item !== undefined) {
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Get the last N items (newest first).
   */
  getLastN(n: number): T[] {
    const count = Math.min(n, this.count);
    const result: T[] = [];

    for (let i = 0; i < count; i++) {
      const index = (this.head - 1 - i + this.capacity) % this.capacity;
      const item = this.buffer[index];
      if (item !== undefined) {
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Current number of items.
   */
  get size(): number {
    return this.count;
  }

  /**
   * Whether the buffer is empty.
   */
  get isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Whether the buffer is at capacity.
   */
  get isFull(): boolean {
    return this.count === this.capacity;
  }

  /**
   * Clear all items.
   */
  clear(): void {
    this.buffer = new Array<T | undefined>(this.capacity);
    this.head = 0;
    this.count = 0;
  }

  /**
   * Iterator support (oldest to newest).
   */
  *[Symbol.iterator](): Iterator<T> {
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) {
      const index = (start + i) % this.capacity;
      const item = this.buffer[index];
      if (item !== undefined) {
        yield item;
      }
    }
  }
}
