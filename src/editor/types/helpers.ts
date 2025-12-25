/**
 * Type Helper Utilities
 *
 * This module provides strongly-typed helpers for:
 * - Guard functions for type narrowing
 * - Generic utilities for common patterns
 * - Safe type assertions
 * - Type predicates for common checks
 *
 * These helpers eliminate the need for `any` and unsafe type assertions.
 */

// =============================================================================
// Guard Functions (Type Predicates)
// =============================================================================

/**
 * Type guard: check if value is a non-empty string.
 * Use instead of relying on string truthiness.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard: check if value is a valid LaneId.
 */
export function isLaneId(value: unknown): value is string {
  return isNonEmptyString(value);
}

/**
 * Type guard: check if value is a valid BlockId.
 */
export function isBlockId(value: unknown): value is string {
  return isNonEmptyString(value);
}

/**
 * Type guard: check if value is a non-null object (not null, not array).
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard: check if value is a plain object (not null, not array).
 * More strict than isObject - ensures it's a plain Record.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  // Check if it's a plain object (not a special class instance)
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === null || proto === Object.prototype;
}

/**
 * Type guard: check if value is an array.
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Type guard: check if value is a non-empty array.
 */
export function isNonEmptyArray<T = unknown>(value: unknown): value is [T, ...T[]] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Type guard: check if value is a number (not NaN).
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Type guard: check if value is a positive number.
 */
export function isPositiveNumber(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

/**
 * Type guard: check if value is a non-negative number.
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

/**
 * Type guard: check if value is a boolean.
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard: check if value is defined (not null or undefined).
 * Use instead of relying on truthiness for nullable values.
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard: check if a string value is a specific literal.
 */
export function isLiteral<T extends string>(value: unknown, literal: T): value is T {
  return value === literal;
}

/**
 * Type guard: check if value is one of the provided literals.
 */
export function isOneOf<T extends string>(value: unknown, literals: readonly T[]): value is T {
  return typeof value === 'string' && (literals as readonly string[]).includes(value);
}

// =============================================================================
// Nullable/Optional Helpers
// =============================================================================

/**
 * Assert that a value is defined, or throw an error.
 * Use for runtime validation of required values.
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string = 'Value is required but was null or undefined'
): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

/**
 * Assert that a value is non-empty string, or throw an error.
 */
export function assertNonEmptyString(
  value: unknown,
  message: string = 'Value is required to be a non-empty string'
): string {
  if (!isNonEmptyString(value)) {
    throw new Error(message);
  }
  return value;
}

/**
 * Get a value or return a default if null/undefined.
 * More type-safe than `??` for complex default values.
 */
export function withDefault<T>(value: T | null | undefined, defaultValue: T): T {
  return value !== null && value !== undefined ? value : defaultValue;
}

/**
 * Get a value or compute a default if null/undefined.
 * Lazy version of withDefault for expensive defaults.
 */
export function withDefaultComputed<T>(
  value: T | null | undefined,
  computeDefault: () => T
): T {
  return value !== null && value !== undefined ? value : computeDefault();
}

// =============================================================================
// Record Helpers (Generic Object Operations)
// =============================================================================

/**
 * Safely get a nested property from an object.
 * Returns undefined if any part of the path is missing.
 */
export function getNestedProperty<T = unknown>(
  obj: Record<string, unknown> | null | undefined,
  ...path: string[]
): T | undefined {
  if (obj === null || obj === undefined) {
    return undefined;
  }

  let current: unknown = obj;
  for (const key of path) {
    if (isObject(current)) {
      current = (current)[key];
    } else {
      return undefined;
    }
  }
  return current as T;
}

/**
 * Safely get a nested property from an object with a default.
 */
export function getNestedPropertyOrDefault<T>(
  obj: Record<string, unknown> | null | undefined,
  defaultValue: T,
  ...path: string[]
): T {
  return withDefault(getNestedProperty<T>(obj, ...path), defaultValue);
}

/**
 * Check if an object has a specific key (type-safe).
 */
export function hasKey<K extends string>(
  obj: Record<string, unknown>,
  key: K
): obj is Record<K, unknown> & Record<string, unknown> {
  return key in obj;
}

/**
 * Check if an object has all of the specified keys.
 */
export function hasKeys<K extends string>(
  obj: Record<string, unknown>,
  keys: readonly K[]
): obj is Record<K, unknown> & Record<string, unknown> {
  return keys.every((key) => key in obj);
}

/**
 * Pick specific keys from an object (type-safe).
 */
export function pick<K extends string>(
  obj: Record<string, unknown>,
  keys: readonly K[]
): Record<K, unknown> {
  const result = {} as Record<K, unknown>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specific keys from an object (type-safe).
 */
export function omit<K extends string>(
  obj: Record<string, unknown>,
  keys: readonly K[]
): Omit<Record<string, unknown>, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<Record<string, unknown>, K>;
}

// =============================================================================
// Array Helpers
// =============================================================================

/**
 * Safely get first element of array.
 */
export function first<T>(arr: readonly T[]): T | undefined {
  return arr[0];
}

/**
 * Safely get last element of array.
 */
export function last<T>(arr: readonly T[]): T | undefined {
  return arr[arr.length - 1];
}

/**
 * Check if array has at least N elements.
 */
export function hasAtLeast<T>(arr: readonly T[], n: number): arr is readonly [T, ...T[]] & { length: number } {
  return arr.length >= n;
}

/**
 * Group array elements by a key function.
 */
export function groupBy<T, K extends string>(
  arr: readonly T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of arr) {
    const key = keyFn(item);
    if (!(key in result)) {
      result[key] = [];
    }
    result[key].push(item);
  }
  return result;
}

/**
 * Create a record from an array using a key function.
 * Last item with duplicate key wins.
 */
export function keyBy<T, K extends string>(
  arr: readonly T[],
  keyFn: (item: T) => K
): Record<K, T> {
  const result = {} as Record<K, T>;
  for (const item of arr) {
    const key = keyFn(item);
    result[key] = item;
  }
  return result;
}

/**
 * Unique array elements (uses Set for O(n) performance).
 */
export function unique<T>(arr: readonly T[]): T[] {
  return Array.from(new Set(arr));
}

/**
 * Unique array elements by a key function.
 */
export function uniqueBy<T, K extends string>(
  arr: readonly T[],
  keyFn: (item: T) => K
): T[] {
  const seen = new Set<K>();
  const result: T[] = [];
  for (const item of arr) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

// =============================================================================
// Readonly Utilities
// =============================================================================

/**
 * Create a readonly version of a record (deep).
 * Use for type safety when you want to ensure immutability.
 */
export function asReadonly<T>(obj: T): Readonly<T> {
  return obj;
}

/**
 * Cast a readonly array to mutable (use sparingly).
 * Only use when you're certain mutation is safe.
 */
export function asMutable<T>(arr: readonly T[]): T[] {
  return arr as T[];
}

/**
 * Cast a readonly record to mutable (use sparingly).
 */
export function asMutableRecord<T extends Record<string, unknown>>(obj: Readonly<T>): T {
  return obj as T;
}

// =============================================================================
// Number Utilities
// =============================================================================

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Map a value from one range to another.
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

// =============================================================================
// String Utilities
// =============================================================================

/**
 * Safely truncate a string to a maximum length.
 */
export function truncate(str: string, maxLength: number, suffix: string = '...'): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Convert a value to string safely (handles null/undefined).
 * Returns empty string for null/undefined instead of '[object Object]'.
 */
export function safeStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (isObject(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return '(object)';
    }
  }
  // Handle remaining types: function, symbol, bigint
  if (typeof value === 'function') {
    return '(function)';
  }
  if (typeof value === 'symbol') {
    return '(symbol)';
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  // Fallback for other types (should not reach here)
  return '(unknown)';
}

// =============================================================================
// Type Assertion Helpers (for testing/fixtures)
// =============================================================================

/**
 * Cast a value to a specific type with a runtime check.
 * Throws if the type guard fails.
 */
export function castTo<T>(
  value: unknown,
  guard: (v: unknown) => v is T,
  message: string = 'Type assertion failed'
): T {
  if (guard(value)) {
    return value;
  }
  throw new Error(message);
}

/**
 * Cast an `any` value to a specific type (use sparingly).
 * Only use when you're certain of the type but TypeScript can't infer it.
 */
export function fromAny<T>(value: unknown, typeName?: string): T {
  if (typeName !== undefined && typeName !== null && typeName !== '' && typeof value !== typeName) {
    throw new TypeError(`Expected ${typeName}, got ${typeof value}`);
  }
  return value as T;
}

// =============================================================================
// Function Utilities
// =============================================================================

/**
 * Create a memoized version of a function (simple LRU cache).
 */
export function memoize<Args extends readonly unknown[], Result>(
  fn: (...args: Args) => Result,
  keyFn?: (...args: Args) => string
): (...args: Args) => Result {
  const cache = new Map<string, Result>();

  return (...args: Args): Result => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * Create a debounced version of a function.
 */
export function debounce<Args extends readonly unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number
): (...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return (...args: Args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}

/**
 * Create a throttled version of a function.
 */
export function throttle<Args extends readonly unknown[]>(
  fn: (...args: Args) => void,
  intervalMs: number
): (...args: Args) => void {
  let lastCall = 0;

  return (...args: Args) => {
    const now = Date.now();
    if (now - lastCall >= intervalMs) {
      lastCall = now;
      fn(...args);
    }
  };
}

// =============================================================================
// Enum-Like Utilities
// =============================================================================

/**
 * Get all values from a const enum or object.
 */
export function getEnumValues<T extends Record<string, string | number>>(enumObj: T): T[keyof T][] {
  return Object.values(enumObj).filter((v) => typeof v === 'string' || typeof v === 'number') as T[keyof T][];
}

/**
 * Check if a value is in an enum.
 */
export function isEnumValue<T extends Record<string, string | number>>(
  enumObj: T,
  value: unknown
): value is T[keyof T] {
  const values = getEnumValues(enumObj);
  return values.includes(value as T[keyof T]);
}

// =============================================================================
// Result Type (for error handling without exceptions)
// =============================================================================

/**
 * A Result type that represents either success or failure.
 * Use instead of throwing exceptions for better type safety.
 */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * Create a successful result.
 */
export function ok<T, E = Error>(value: T): Result<T, E> {
  return { ok: true, value };
}

/**
 * Create a failed result.
 */
export function err<E = Error>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Unwrap a result or throw if it's an error.
 */
export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result or return a default value if it's an error.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/**
 * Map over the success value of a result.
 */
export function mapResult<T, U, E extends Error = Error>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result as Result<U, E>;
}

/**
 * FlatMap over the success value of a result.
 */
export function flatMapResult<T, U, E extends Error = Error>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result as Result<U, E>;
}
