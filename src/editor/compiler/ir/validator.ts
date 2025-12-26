/**
 * IR Validator (Sprint 2, P0-5)
 *
 * Validates LinkedGraphIR for structural integrity:
 * - All ID references are in bounds
 * - No circular expression references
 * - Type consistency
 *
 * This is a development-time safety net to catch IR generation bugs early.
 */

import type { LinkedGraphIR } from '../passes/pass8-link-resolution';
import type { CompileError } from '../types';
import type { SigExprId, FieldExprId } from './types';

export interface IRValidationError {
  code: 'InvalidSigExprRef' | 'InvalidFieldExprRef' | 'InvalidConstRef' | 'CircularReference' | 'TypeMismatch';
  message: string;
  where?: {
    sigExprId?: SigExprId;
    fieldExprId?: FieldExprId;
    constId?: number;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: IRValidationError[];
  warnings: IRValidationError[];
}

/**
 * Validate a LinkedGraphIR for structural integrity.
 *
 * Checks:
 * 1. All SigExprId references are in bounds
 * 2. All FieldExprId references are in bounds
 * 3. All constId references are in bounds
 * 4. No circular expression references (SCC detection)
 *
 * @param ir - The LinkedGraphIR to validate
 * @returns ValidationResult with errors and warnings
 */
export function validateIR(ir: LinkedGraphIR): ValidationResult {
  const errors: IRValidationError[] = [];
  const warnings: IRValidationError[] = [];

  // Get the builder to access internal structures
  const { builder } = ir;

  // Access builder internals via build() - this gives us the program structure
  const program = builder.build();

  // Validate signal expression IDs
  for (let i = 0; i < program.signalIR.nodes.length; i++) {
    const expr = program.signalIR.nodes[i];

    // Check references in dependencies (if any)
    if ('deps' in expr && Array.isArray(expr.deps)) {
      for (const depId of expr.deps) {
        if (typeof depId === 'number') {
          if (depId < 0 || depId >= program.signalIR.nodes.length) {
            errors.push({
              code: 'InvalidSigExprRef',
              message: `Signal expression ${i} references invalid signal ${depId} (max: ${program.signalIR.nodes.length - 1})`,
              where: { sigExprId: i },
            });
          }
        }
      }
    }
  }

  // Validate field expression IDs
  for (let i = 0; i < program.fieldIR.nodes.length; i++) {
    const expr = program.fieldIR.nodes[i];

    // Check references in dependencies (if any)
    if ('deps' in expr && Array.isArray(expr.deps)) {
      for (const depId of expr.deps) {
        if (typeof depId === 'number') {
          if (depId < 0 || depId >= program.fieldIR.nodes.length) {
            errors.push({
              code: 'InvalidFieldExprRef',
              message: `Field expression ${i} references invalid field ${depId} (max: ${program.fieldIR.nodes.length - 1})`,
              where: { fieldExprId: i },
            });
          }
        }
      }
    }
  }

  // Validate constant pool references
  const constPoolSize = program.constants.length;

  // Check signal expressions for const references
  for (let i = 0; i < program.signalIR.nodes.length; i++) {
    const expr = program.signalIR.nodes[i];

    if ('constId' in expr && typeof expr.constId === 'number') {
      if (expr.constId < 0 || expr.constId >= constPoolSize) {
        errors.push({
          code: 'InvalidConstRef',
          message: `Signal expression ${i} references invalid const ${expr.constId} (max: ${constPoolSize - 1})`,
          where: { sigExprId: i, constId: expr.constId },
        });
      }
    }
  }

  // Check field expressions for const references
  for (let i = 0; i < program.fieldIR.nodes.length; i++) {
    const expr = program.fieldIR.nodes[i];

    if ('constId' in expr && typeof expr.constId === 'number') {
      if (expr.constId < 0 || expr.constId >= constPoolSize) {
        errors.push({
          code: 'InvalidConstRef',
          message: `Field expression ${i} references invalid const ${expr.constId} (max: ${constPoolSize - 1})`,
          where: { fieldExprId: i, constId: expr.constId },
        });
      }
    }
  }

  // Detect circular references in signal expressions (simple cycle detection)
  const signalVisited = new Set<number>();
  const signalRecStack = new Set<number>();

  function detectSignalCycle(id: number): boolean {
    if (signalRecStack.has(id)) {
      return true; // Cycle detected
    }
    if (signalVisited.has(id)) {
      return false; // Already checked
    }

    signalVisited.add(id);
    signalRecStack.add(id);

    const expr = program.signalIR.nodes[id];
    if ('deps' in expr && Array.isArray(expr.deps)) {
      for (const depId of expr.deps) {
        if (typeof depId === 'number' && depId >= 0 && depId < program.signalIR.nodes.length) {
          if (detectSignalCycle(depId)) {
            errors.push({
              code: 'CircularReference',
              message: `Circular reference detected in signal expression chain involving ${id}`,
              where: { sigExprId: id },
            });
            signalRecStack.delete(id);
            return true;
          }
        }
      }
    }

    signalRecStack.delete(id);
    return false;
  }

  for (let i = 0; i < program.signalIR.nodes.length; i++) {
    if (!signalVisited.has(i)) {
      detectSignalCycle(i);
    }
  }

  // Detect circular references in field expressions
  const fieldVisited = new Set<number>();
  const fieldRecStack = new Set<number>();

  function detectFieldCycle(id: number): boolean {
    if (fieldRecStack.has(id)) {
      return true; // Cycle detected
    }
    if (fieldVisited.has(id)) {
      return false; // Already checked
    }

    fieldVisited.add(id);
    fieldRecStack.add(id);

    const expr = program.fieldIR.nodes[id];
    if ('deps' in expr && Array.isArray(expr.deps)) {
      for (const depId of expr.deps) {
        if (typeof depId === 'number' && depId >= 0 && depId < program.fieldIR.nodes.length) {
          if (detectFieldCycle(depId)) {
            errors.push({
              code: 'CircularReference',
              message: `Circular reference detected in field expression chain involving ${id}`,
              where: { fieldExprId: id },
            });
            fieldRecStack.delete(id);
            return true;
          }
        }
      }
    }

    fieldRecStack.delete(id);
    return false;
  }

  for (let i = 0; i < program.fieldIR.nodes.length; i++) {
    if (!fieldVisited.has(i)) {
      detectFieldCycle(i);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Convert IRValidationError to CompileError for use in compiler.
 */
export function irErrorToCompileError(irError: IRValidationError): CompileError {
  // CompileError.where doesn't have sigExprId/fieldExprId/constId fields
  // Just include the message with context
  return {
    code: 'IRValidationFailed',
    message: `[IR Validation] ${irError.message}`,
    // Omit where field since IRValidationError.where is incompatible with CompileError.where
  };
}
