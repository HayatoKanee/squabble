/**
 * Circular buffer for efficient in-memory event storage
 * Automatically overwrites oldest events when capacity is reached
 */
export class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private writeIndex: number = 0;
  private size: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('Buffer capacity must be positive');
    }
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Add an item to the buffer
   */
  push(item: T): void {
    this.buffer[this.writeIndex] = item;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  /**
   * Get all items in chronological order
   */
  toArray(): T[] {
    if (this.size === 0) return [];
    
    const result: T[] = [];
    
    if (this.size < this.capacity) {
      // Buffer not full yet, simple case
      for (let i = 0; i < this.size; i++) {
        result.push(this.buffer[i]!);
      }
    } else {
      // Buffer is full, need to read in circular order
      // Start from oldest item (writeIndex is next write position)
      for (let i = 0; i < this.capacity; i++) {
        const index = (this.writeIndex + i) % this.capacity;
        result.push(this.buffer[index]!);
      }
    }
    
    return result;
  }

  /**
   * Iterate over items in chronological order
   */
  forEach(callback: (item: T, index: number) => void): void {
    this.toArray().forEach(callback);
  }

  /**
   * Get the most recent N items
   */
  getRecent(count: number): T[] {
    const items = this.toArray();
    return items.slice(-count);
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.writeIndex = 0;
    this.size = 0;
  }

  /**
   * Get current number of items in buffer
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Check if buffer is full
   */
  isFull(): boolean {
    return this.size === this.capacity;
  }
}