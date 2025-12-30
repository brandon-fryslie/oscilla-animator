/**
 * Convert ValueRecord32 to ValueSummary for UI display.
 *
 * This bridges the low-level ring buffer encoding (ValueRecord32)
 * to the high-level debug UI format (ValueSummary).
 */

import type { ValueRecord32 } from './ValueRecord';
import { ValueTag, decodeScalar, decodeBoolean, decodeVec2, decodeColor } from './ValueRecord';
import type { ValueSummary } from './types';

/**
 * Convert ValueRecord32 to ValueSummary.
 *
 * @param record - Value record from ring buffer
 * @returns ValueSummary for UI display, or null if conversion fails
 */
export function valueRecordToSummary(record: ValueRecord32): ValueSummary | null {
  switch (record.tag) {
    case ValueTag.Number: {
      const value = decodeScalar(record);
      if (value === null) return null;
      return { t: 'num', v: value };
    }

    case ValueTag.Boolean: {
      const value = decodeBoolean(record);
      if (value === null) return null;
      return { t: 'bool', v: value };
    }

    case ValueTag.Vec2: {
      const vec = decodeVec2(record);
      if (vec === null) return null;
      return { t: 'vec2', x: vec.x, y: vec.y };
    }

    case ValueTag.Color: {
      const color = decodeColor(record);
      if (color === null) return null;
      // Pack color back to u32 format (RGBA)
      const r = Math.round(color.r * 255);
      const g = Math.round(color.g * 255);
      const b = Math.round(color.b * 255);
      const a = Math.round(color.a * 255);
      const packed = (r << 24) | (g << 16) | (b << 8) | a;
      return { t: 'color', v: packed };
    }

    case ValueTag.FieldStats:
      // Field stats cannot be directly represented in ValueSummary
      // Return 'none' to indicate field data is available but not displayable
      // Future: Add field-specific visualization
      return { t: 'none' };

    case ValueTag.None:
      return { t: 'none' };

    default:
      // Unsupported tag
      return null;
  }
}
