/**
 * ValueRecord Encoding
 *
 * Fixed-size (32-byte) value encoding for ring buffer storage.
 * Supports scalars, vectors, colors, and aggregate statistics.
 *
 * Memory layout (32 bytes):
 * - tag: u8 (ValueTag enum)
 * - typeId: u16 (TypeKeyId from TypeKeyTable)
 * - padding: u8
 * - a, b, c, d, e, f: u32 (6 payload slots, 24 bytes total)
 *
 * Each ValueTag defines how to interpret the payload slots.
 */

import type { TypeKeyId } from './TypeKeyEncoding';

/**
 * ValueTag identifies the encoding scheme for a value record.
 */
export const ValueTag = {
  /** No value (null/undefined) */
  None: 0,

  /** Scalar number (float32) */
  Number: 1,

  /** Boolean value */
  Boolean: 2,

  /** RGBA color (premultiplied linear) */
  Color: 4,

  /** 2D vector */
  Vec2: 5,

  /** 3D vector */
  Vec3: 6,

  /** 4D vector */
  Vec4: 7,

  /** Field statistics (n, min, max, hash) */
  FieldStats: 20,

  /** Signal statistics (sampling metadata) */
  SignalStats: 21,

  /** 64-bit hash */
  Hash64: 30,
} as const;

export type ValueTag = typeof ValueTag[keyof typeof ValueTag];

/**
 * Bitmask for which statistics are present in FieldStats.
 */
export const FieldStatMask = {
  None: 0,
  HasMinMax: 1,
  HasMean: 2,
  HasStdDev: 4,
  HasNaN: 8,
} as const;

export type FieldStatMask = typeof FieldStatMask[keyof typeof FieldStatMask];

/**
 * ValueRecord32 is a fixed-size (32 byte) value encoding.
 *
 * Payload interpretation depends on tag:
 *
 * Number:
 *   a = packF32(value)
 *   b = flags (future: NaN origin, etc.)
 *
 * Boolean:
 *   a = 0 (false) or 1 (true)
 *
 * Vec2:
 *   a = packF32(x)
 *   b = packF32(y)
 *
 * Vec3:
 *   a = packF32(x)
 *   b = packF32(y)
 *   c = packF32(z)
 *
 * Vec4:
 *   a = packF32(x)
 *   b = packF32(y)
 *   c = packF32(z)
 *   d = packF32(w)
 *
 * Color (premultiplied linear RGBA):
 *   a = packF32(r)
 *   b = packF32(g)
 *   c = packF32(b)
 *   d = packF32(a)
 *
 * FieldStats:
 *   a = domainId (future: domain-specific encoding)
 *   b = n (element count)
 *   c = statMask (FieldStatMask bitfield)
 *   d = packF32(min)
 *   e = packF32(max)
 *   f = hashLow32 (future: content hash)
 *
 * Hash64:
 *   a = hashLow32
 *   b = hashHigh32
 */
export interface ValueRecord32 {
  tag: ValueTag;
  typeId: TypeKeyId;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Pack a float64 into a float32 representation (IEEE 754).
 * Not lossy half-float - just reinterpret as u32 bits.
 */
export function packF32(value: number): number {
  const buf = new Float32Array([value]);
  const view = new Uint32Array(buf.buffer);
  return view[0];
}

/**
 * Unpack a u32 back to float64.
 */
export function unpackF32(packed: number): number {
  const buf = new Uint32Array([packed]);
  const view = new Float32Array(buf.buffer);
  return view[0];
}

/**
 * Encode a scalar number.
 */
export function encodeScalar(value: number, typeId: TypeKeyId): ValueRecord32 {
  return {
    tag: ValueTag.Number,
    typeId,
    a: packF32(value),
    b: 0, // flags slot (future use)
    c: 0,
    d: 0,
    e: 0,
    f: 0,
  };
}

/**
 * Decode a scalar number.
 */
export function decodeScalar(record: ValueRecord32): number | null {
  if (record.tag !== ValueTag.Number) return null;
  return unpackF32(record.a);
}

/**
 * Encode a boolean value.
 */
export function encodeBoolean(value: boolean, typeId: TypeKeyId): ValueRecord32 {
  return {
    tag: ValueTag.Boolean,
    typeId,
    a: value ? 1 : 0,
    b: 0,
    c: 0,
    d: 0,
    e: 0,
    f: 0,
  };
}

/**
 * Decode a boolean value.
 */
export function decodeBoolean(record: ValueRecord32): boolean | null {
  if (record.tag !== ValueTag.Boolean) return null;
  return record.a !== 0;
}

/**
 * Encode a Vec2.
 */
export function encodeVec2(x: number, y: number, typeId: TypeKeyId): ValueRecord32 {
  return {
    tag: ValueTag.Vec2,
    typeId,
    a: packF32(x),
    b: packF32(y),
    c: 0,
    d: 0,
    e: 0,
    f: 0,
  };
}

/**
 * Decode a Vec2.
 */
export function decodeVec2(record: ValueRecord32): { x: number; y: number } | null {
  if (record.tag !== ValueTag.Vec2) return null;
  return {
    x: unpackF32(record.a),
    y: unpackF32(record.b),
  };
}

/**
 * Encode a Vec3.
 */
export function encodeVec3(x: number, y: number, z: number, typeId: TypeKeyId): ValueRecord32 {
  return {
    tag: ValueTag.Vec3,
    typeId,
    a: packF32(x),
    b: packF32(y),
    c: packF32(z),
    d: 0,
    e: 0,
    f: 0,
  };
}

/**
 * Decode a Vec3.
 */
export function decodeVec3(record: ValueRecord32): { x: number; y: number; z: number } | null {
  if (record.tag !== ValueTag.Vec3) return null;
  return {
    x: unpackF32(record.a),
    y: unpackF32(record.b),
    z: unpackF32(record.c),
  };
}

/**
 * Encode a Vec4.
 */
export function encodeVec4(x: number, y: number, z: number, w: number, typeId: TypeKeyId): ValueRecord32 {
  return {
    tag: ValueTag.Vec4,
    typeId,
    a: packF32(x),
    b: packF32(y),
    c: packF32(z),
    d: packF32(w),
    e: 0,
    f: 0,
  };
}

/**
 * Decode a Vec4.
 */
export function decodeVec4(record: ValueRecord32): { x: number; y: number; z: number; w: number } | null {
  if (record.tag !== ValueTag.Vec4) return null;
  return {
    x: unpackF32(record.a),
    y: unpackF32(record.b),
    z: unpackF32(record.c),
    w: unpackF32(record.d),
  };
}

/**
 * Encode a color (premultiplied linear RGBA).
 */
export function encodeColor(r: number, g: number, b: number, a: number, typeId: TypeKeyId): ValueRecord32 {
  return {
    tag: ValueTag.Color,
    typeId,
    a: packF32(r),
    b: packF32(g),
    c: packF32(b),
    d: packF32(a),
    e: 0,
    f: 0,
  };
}

/**
 * Decode a color.
 */
export function decodeColor(record: ValueRecord32): { r: number; g: number; b: number; a: number } | null {
  if (record.tag !== ValueTag.Color) return null;
  return {
    r: unpackF32(record.a),
    g: unpackF32(record.b),
    b: unpackF32(record.c),
    a: unpackF32(record.d),
  };
}

/**
 * Encode field statistics.
 */
export function encodeFieldStats(
  n: number,
  min: number,
  max: number,
  typeId: TypeKeyId,
  domainId: number = 0,
  hashLow32: number = 0
): ValueRecord32 {
  return {
    tag: ValueTag.FieldStats,
    typeId,
    a: domainId,
    b: n,
    c: FieldStatMask.HasMinMax,
    d: packF32(min),
    e: packF32(max),
    f: hashLow32,
  };
}

/**
 * Decode field statistics.
 */
export function decodeFieldStats(record: ValueRecord32): {
  n: number;
  min: number;
  max: number;
  domainId: number;
  statMask: FieldStatMask;
  hashLow32: number;
} | null {
  if (record.tag !== ValueTag.FieldStats) return null;
  return {
    domainId: record.a,
    n: record.b,
    statMask: record.c as FieldStatMask,
    min: unpackF32(record.d),
    max: unpackF32(record.e),
    hashLow32: record.f,
  };
}

/**
 * Encode a 64-bit hash.
 */
export function encodeHash64(hashLow32: number, hashHigh32: number, typeId: TypeKeyId): ValueRecord32 {
  return {
    tag: ValueTag.Hash64,
    typeId,
    a: hashLow32,
    b: hashHigh32,
    c: 0,
    d: 0,
    e: 0,
    f: 0,
  };
}

/**
 * Decode a 64-bit hash.
 */
export function decodeHash64(record: ValueRecord32): { low: number; high: number } | null {
  if (record.tag !== ValueTag.Hash64) return null;
  return {
    low: record.a,
    high: record.b,
  };
}
