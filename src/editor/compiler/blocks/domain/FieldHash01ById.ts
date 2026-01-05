/**
 * FieldHash01ById Block Compiler
 *
 * Creates a deterministic random Field based on element ID.
 * Returns values in [0, 1) that are stable per element across frames.
 *
 * Uses a simple hash function based on element ID and seed.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerFieldHash01ById: BlockLowerFn = ({ ctx, inputs, config }) => {
  const [domain] = inputs;

  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('FieldHash01ById requires domain input');
  }

  // Extract seed from config (params are now passed as config)
  const configObj = config as { seed?: unknown } | undefined;
  const blockSeed = Number(configObj?.seed ?? 0);

  // For now, we emit a kernel-based field map node
  // The kernel 'hash01ById' will be implemented in the runtime
  const outType = { world: "field" as const, domain: "float" as const, category: "core" as const, busEligible: true };

  // Use Hash01ById opcode if available, otherwise use a kernel reference
  const fieldId = ctx.b.fieldMap(
    // Start with a placeholder constant field that will be overridden by the kernel
    ctx.b.fieldConst(0, outType),
    { kind: 'opcode', opcode: OpCode.Hash01ById },
    outType,
    { seed: blockSeed }
  );

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'FieldHash01ById_out');
  return {
    outputs: [],
    outputsById: { u: { k: 'field', id: fieldId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldHash01ById',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: "config", domain: "domain", category: "internal", busEligible: false }, defaultSource: { value: 100 } },
  ],
  outputs: [
    { portId: 'u', label: 'U', dir: 'out', type: { world: "field", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerFieldHash01ById,
});
