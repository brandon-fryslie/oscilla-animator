/**
 * PathConst Block Compiler
 *
 * Creates a constant path Field - same path for all elements.
 * Takes a Domain and produces Field<path>.
 */

import type { BlockCompiler, Field } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerPathConst: BlockLowerFn = ({ ctx, inputs, config }) => {
  const [domain] = inputs;

  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('PathConst requires domain input');
  }

  // Extract path from config (params are now passed as config)
  // Config should contain a PathExpr object with commands array
  const configObj = config as { path?: unknown } | undefined;
  const pathExpr = configObj?.path ?? {
    commands: [
      { kind: 'M', x: 0, y: 0 },
      { kind: 'L', x: 100, y: 0 },
      { kind: 'L', x: 100, y: 100 },
      { kind: 'L', x: 0, y: 100 },
      { kind: 'Z' },
    ],
  };

  const outType = { world: "field" as const, domain: "path" as const, category: "internal" as const, busEligible: false };
  const fieldId = ctx.b.fieldConst(pathExpr, outType);

  const slot = ctx.b.allocValueSlot();
  return { outputs: [{ k: 'field', id: fieldId, slot }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'PathConst',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: "config", domain: "domain", category: "internal", busEligible: false }, defaultSource: { value: 1 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "field", domain: "path", category: "internal", busEligible: false } },
  ],
  lower: lowerPathConst,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const PathConstBlock: BlockCompiler = {
  type: 'PathConst',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:Path' } },
  ],

  compile({ inputs }) {
    const domainArtifact = inputs.domain;
    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        out: {
          kind: 'Error',
          message: 'PathConst requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;

    // Use default path expression - in future this could come from params
    const pathExpr = {
      commands: [
        { kind: 'M', x: 0, y: 0 },
        { kind: 'L', x: 100, y: 0 },
        { kind: 'L', x: 100, y: 100 },
        { kind: 'L', x: 0, y: 100 },
        { kind: 'Z' },
      ],
    };

    // Create constant field that returns the same path for all elements
    const field: Field<unknown> = (_seed, n) => {
      const count = Math.min(n, domain.elements.length);
      return new Array(count).fill(pathExpr);
    };

    return {
      out: { kind: 'Field:Path', value: field },
    };
  },
};
