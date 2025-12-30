/**
 * SignalHistoryBuffer - Ring buffer for time-series signal data
 *
 * Stores (time, value) pairs for signal visualization as waveforms.
 * Auto-tracks min/max for auto-scaling display bounds.
 *
 * Zero-allocation ring buffer using typed arrays:
 * - times: Float64Array (time in seconds)
 * - values: Float32Array (signal values)
 *
 * Used by SignalGraph component for real-time waveform visualization.
 */

/**
 * Default capacity: 1000 samples (~16 seconds at 60fps)
 */
export const DEFAULT_HISTORY_CAPACITY = 1000;

/**
 * SignalHistoryBuffer stores time-series data for signal debugging.
 *
 * Key features:
 * - Fixed-capacity ring buffer (pre-allocated arrays)
 * - Automatic min/max tracking for auto-scaling
 * - Wraps at capacity (oldest samples overwritten)
 * - Efficient for 60fps updates
 */
export class SignalHistoryBuffer {
  private readonly capacity: number;
  private writePtr = 0;

  // Columnar storage for time-series
  private readonly times: Float64Array;
  private readonly values: Float32Array;

  // Auto-scaling bounds
  private minValue = Infinity;
  private maxValue = -Infinity;

  // Track if bounds need recalculation (after wrap)
  private boundsStale = false;

  constructor(capacity: number = DEFAULT_HISTORY_CAPACITY) {
    this.capacity = capacity;
    this.times = new Float64Array(capacity);
    this.values = new Float32Array(capacity);
  }

  /**
   * Add a sample to the history buffer.
   *
   * @param t - Time in seconds
   * @param value - Signal value
   * @returns Index where sample was written
   */
  addSample(t: number, value: number): number {
    const idx = this.writePtr % this.capacity;

    // Check if we're about to wrap (overwrite oldest value)
    if (this.writePtr >= this.capacity) {
      this.boundsStale = true; // Need to recalculate min/max
    }

    this.times[idx] = t;
    this.values[idx] = value;

    // Update min/max incrementally if not stale
    if (!this.boundsStale) {
      if (value < this.minValue) this.minValue = value;
      if (value > this.maxValue) this.maxValue = value;
    }

    this.writePtr++;
    return idx;
  }

  /**
   * Get the most recent N samples.
   *
   * @param count - Number of samples to retrieve (defaults to all available)
   * @returns Array of (t, value) pairs in chronological order
   */
  getSamples(count?: number): Array<{ t: number; value: number }> {
    const available = this.size();
    const n = count !== undefined ? Math.min(count, available) : available;

    if (n === 0) return [];

    const result: Array<{ t: number; value: number }> = [];

    // Start from the oldest valid sample
    const startIdx = Math.max(0, this.writePtr - n);

    for (let i = startIdx; i < this.writePtr; i++) {
      const physicalIdx = i % this.capacity;
      result.push({
        t: this.times[physicalIdx],
        value: this.values[physicalIdx],
      });
    }

    return result;
  }

  /**
   * Get auto-scaling bounds for display.
   * Returns { min, max } with padding for visualization.
   *
   * If bounds are stale (after wrap), recalculates from buffer.
   */
  getBounds(): { min: number; max: number } {
    if (this.boundsStale) {
      this.recalculateBounds();
    }

    // Handle edge cases
    if (this.writePtr === 0) {
      return { min: -1, max: 1 }; // Default range
    }

    if (this.minValue === this.maxValue) {
      // Constant value - add padding
      const center = this.minValue;
      const padding = Math.abs(center) * 0.1 || 0.1;
      return { min: center - padding, max: center + padding };
    }

    // Add 10% padding to range for visual breathing room
    const range = this.maxValue - this.minValue;
    const padding = range * 0.1;

    return {
      min: this.minValue - padding,
      max: this.maxValue + padding,
    };
  }

  /**
   * Get the time range of stored samples.
   *
   * @returns { start, end } time in seconds, or null if buffer empty
   */
  getTimeRange(): { start: number; end: number } | null {
    if (this.writePtr === 0) return null;

    const available = this.size();
    const startIdx = Math.max(0, this.writePtr - available);
    const endIdx = this.writePtr - 1;

    return {
      start: this.times[startIdx % this.capacity],
      end: this.times[endIdx % this.capacity],
    };
  }

  /**
   * Get the current number of valid samples in the buffer.
   */
  size(): number {
    return Math.min(this.writePtr, this.capacity);
  }

  /**
   * Get the buffer capacity.
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Clear the buffer and reset bounds.
   */
  clear(): void {
    this.writePtr = 0;
    this.minValue = Infinity;
    this.maxValue = -Infinity;
    this.boundsStale = false;
  }

  /**
   * Recalculate min/max from current buffer contents.
   * Called when bounds are stale (after ring wrap).
   */
  private recalculateBounds(): void {
    const n = this.size();
    if (n === 0) {
      this.minValue = Infinity;
      this.maxValue = -Infinity;
      this.boundsStale = false;
      return;
    }

    let min = Infinity;
    let max = -Infinity;

    const startIdx = Math.max(0, this.writePtr - n);
    for (let i = startIdx; i < this.writePtr; i++) {
      const value = this.values[i % this.capacity];
      if (value < min) min = value;
      if (value > max) max = value;
    }

    this.minValue = min;
    this.maxValue = max;
    this.boundsStale = false;
  }
}
