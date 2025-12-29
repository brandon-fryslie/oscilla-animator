import { describe, it, expect } from 'vitest';
import {
  valueKindToTypeDesc,
  slotTypeToTypeDesc,
  domainFromString,
  typeDescToString,
} from '../typeConversion';

describe('Type Conversion', () => {
  describe('valueKindToTypeDesc', () => {
    describe('Scalar types', () => {
      it('converts Scalar:float', () => {
        const result = valueKindToTypeDesc('Scalar:float');
        expect(result.world).toBe('scalar');
        expect(result.domain).toBe('float');
      });

      it('converts Scalar:boolean', () => {
        const result = valueKindToTypeDesc('Scalar:boolean');
        expect(result.world).toBe('scalar');
        expect(result.domain).toBe('boolean');
      });

      it('converts Scalar:color', () => {
        const result = valueKindToTypeDesc('Scalar:color');
        expect(result.world).toBe('scalar');
        expect(result.domain).toBe('color');
      });

      it('converts Scalar:vec2', () => {
        const result = valueKindToTypeDesc('Scalar:vec2');
        expect(result.world).toBe('scalar');
        expect(result.domain).toBe('vec2');
      });
    });

    describe('Signal types', () => {
      it('converts Signal:float', () => {
        const result = valueKindToTypeDesc('Signal:float');
        expect(result.world).toBe('signal');
        expect(result.domain).toBe('float');
      });

    it('converts Signal:phase', () => {
      const result = valueKindToTypeDesc('Signal:phase');
      expect(result.world).toBe('signal');
      expect(result.domain).toBe('float');
      expect(result.semantics).toBe('phase(0..1)');
    });

      it('converts Signal:Time with unit', () => {
        const result = valueKindToTypeDesc('Signal:Time');
        expect(result.world).toBe('signal');
        expect(result.domain).toBe('time');
        expect(result.unit).toBe('ms');
      });

      it('converts Signal:Unit with semantics', () => {
        const result = valueKindToTypeDesc('Signal:Unit');
        expect(result.world).toBe('signal');
        expect(result.domain).toBe('float');
        expect(result.semantics).toBe('unit(0..1)');
      });

      it('converts Signal:color', () => {
        const result = valueKindToTypeDesc('Signal:color');
        expect(result.world).toBe('signal');
        expect(result.domain).toBe('color');
      });
    });

    describe('Field types', () => {
      it('converts Field:float', () => {
        const result = valueKindToTypeDesc('Field:float');
        expect(result.world).toBe('field');
        expect(result.domain).toBe('float');
      });

      it('converts Field:vec2', () => {
        const result = valueKindToTypeDesc('Field:vec2');
        expect(result.world).toBe('field');
        expect(result.domain).toBe('vec2');
      });

      it('converts Field<Point> with semantics', () => {
        const result = valueKindToTypeDesc('Field<Point>');
        expect(result.world).toBe('field');
        expect(result.domain).toBe('vec2');
        expect(result.semantics).toBe('point');
      });

      it('converts Field:Point with semantics', () => {
        const result = valueKindToTypeDesc('Field:Point');
        expect(result.world).toBe('field');
        expect(result.domain).toBe('vec2');
        expect(result.semantics).toBe('point');
      });

      it('converts Field:Path', () => {
        const result = valueKindToTypeDesc('Field:Path');
        expect(result.world).toBe('field');
        expect(result.domain).toBe('path');
      });
    });

    describe('Special types', () => {
      it('converts Domain', () => {
        const result = valueKindToTypeDesc('Domain');
        expect(result.world).toBe('config');
        expect(result.domain).toBe('domain');
      });

      it('converts RenderTree', () => {
        const result = valueKindToTypeDesc('RenderTree');
        expect(result.world).toBe('signal');
        expect(result.domain).toBe('renderTree');
      });

      it('converts Event to Signal:trigger', () => {
        const result = valueKindToTypeDesc('Event');
        expect(result.world).toBe('signal');
        expect(result.domain).toBe('trigger');
      });

      it('converts Render', () => {
        const result = valueKindToTypeDesc('Render');
        expect(result.world).toBe('signal');
        expect(result.domain).toBe('render');
      });
    });

    describe('Unknown types', () => {
      it('returns unknown for unrecognized ValueKind', () => {
        const result = valueKindToTypeDesc('Signal:WeirdType');
        expect(result.domain).toBe('unknown');
      });
    });
  });

  describe('slotTypeToTypeDesc', () => {
    it('parses Signal<phase>', () => {
      const result = slotTypeToTypeDesc('Signal<phase>');
      expect(result.world).toBe('signal');
      expect(result.domain).toBe('float');
      expect(result.semantics).toBe('phase(0..1)');
    });

    it('parses Signal<float>', () => {
      const result = slotTypeToTypeDesc('Signal<float>');
      expect(result.world).toBe('signal');
      expect(result.domain).toBe('float');
    });

    it('parses Field<Point> with semantics', () => {
      const result = slotTypeToTypeDesc('Field<Point>');
      expect(result.world).toBe('field');
      expect(result.domain).toBe('vec2');
      expect(result.semantics).toBe('point');
    });

    it('parses Field<vec2>', () => {
      const result = slotTypeToTypeDesc('Field<vec2>');
      expect(result.world).toBe('field');
      expect(result.domain).toBe('vec2');
    });

    it('parses Scalar:float', () => {
      const result = slotTypeToTypeDesc('Scalar:float');
      expect(result.world).toBe('scalar');
      expect(result.domain).toBe('float');
    });

    it('parses bare Domain', () => {
      const result = slotTypeToTypeDesc('Domain');
      expect(result.world).toBe('config');
      expect(result.domain).toBe('domain');
    });

    it('returns unknown for unrecognized SlotType', () => {
      const result = slotTypeToTypeDesc('UnknownType');
      expect(result.domain).toBe('unknown');
    });
  });

  describe('domainFromString', () => {
    it('handles lowercase core domains', () => {
      expect(domainFromString('number')).toBe('float');
      expect(domainFromString('float')).toBe('float');
      expect(domainFromString('int')).toBe('int');
      expect(domainFromString('vec2')).toBe('vec2');
      expect(domainFromString('color')).toBe('color');
      expect(domainFromString('phase')).toBe('float');
      expect(domainFromString('time')).toBe('time');
      expect(domainFromString('trigger')).toBe('trigger');
    });

    it('handles PascalCase core domains', () => {
      expect(domainFromString('Number')).toBe('float');
      expect(domainFromString('Float')).toBe('float');
      expect(domainFromString('Int')).toBe('int');
      expect(domainFromString('Vec2')).toBe('vec2');
      expect(domainFromString('Phase')).toBe('float');
      expect(domainFromString('Time')).toBe('time');
    });

    it('handles Point as vec2', () => {
      expect(domainFromString('Point')).toBe('vec2');
      expect(domainFromString('point')).toBe('vec2');
    });

    it('handles Unit as number', () => {
      expect(domainFromString('Unit')).toBe('float');
      expect(domainFromString('unit')).toBe('float');
    });

    it('handles internal domains', () => {
      expect(domainFromString('renderTree')).toBe('renderTree');
      expect(domainFromString('RenderTree')).toBe('renderTree');
      expect(domainFromString('path')).toBe('path');
      expect(domainFromString('Path')).toBe('path');
    });

    it('returns unknown for unrecognized domains', () => {
      expect(domainFromString('FooBar')).toBe('unknown');
    });
  });

  describe('typeDescToString', () => {
    it('formats signal types', () => {
      const result = typeDescToString({ world: 'signal', domain: 'float' });
      expect(result).toBe('Signal:float');
    });

    it('formats field types', () => {
      const result = typeDescToString({ world: 'field', domain: 'vec2' });
      expect(result).toBe('Field:vec2');
    });

    it('formats types with semantics', () => {
      const result = typeDescToString({ world: 'field', domain: 'vec2', semantics: 'point' });
      expect(result).toBe('Field<Vec2:point>');
    });
  });

  describe('Round-trip validation', () => {
    it('ValueKind → TypeDesc preserves type information', () => {
      const kinds = [
        'Signal:float',
        'Signal:phase',
        'Field:vec2',
        'Field<Point>',
        'Scalar:color',
        'Domain',
        'Event',
      ];

      for (const kind of kinds) {
        const typeDesc = valueKindToTypeDesc(kind);
        expect(typeDesc.world).toBeDefined();
        expect(typeDesc.domain).toBeDefined();
        // Should not be unknown for known types
        if (!kind.includes('Unknown')) {
          expect(typeDesc.domain).not.toBe('unknown');
        }
      }
    });
  });
});
