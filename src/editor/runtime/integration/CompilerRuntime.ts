/**
 * @file CompilerRuntime - Integration Layer Between Compiler and Runtime
 * @description
 * This module wires the compiler's LinkedGraphIR (Pass 8 output) to the runtime
 * field materialization system. It's the bridge between compilation and execution.
 *
 * Key Responsibilities:
 * - Load FieldExprTable from LinkedGraphIR into runtime materializer
 * - Convert compiler TypeDesc to runtime TypeDesc for all field nodes
 * - Provide domain count resolution from IR domain slots
 * - Expose const pool access from IR
 * - Wire bus combine specifications from Pass 7 to runtime
 *
 * References:
 * - HANDOFF-5-fieldexpr-materialization.md (Topic 1-4)
 * - src/editor/compiler/passes/pass8-link-resolution.ts (LinkedGraphIR)
 * - src/editor/runtime/field/Materializer.ts (MaterializerEnv)
 */

import type { LinkedGraphIR } from '../../compiler/passes/pass8-link-resolution';
import type { FieldExprTable } from '../../compiler/ir/fieldExpr';
import type { IRBuilder } from '../../compiler/ir/IRBuilder';
import type { ValueSlot } from '../../compiler/ir/types';
import { FieldMaterializer, type MaterializerEnv, type ConstantsTable, type SourceFields } from '../field/Materializer';
import { FieldBufferPool } from '../field/BufferPool';
import { createFieldHandleCache } from '../field/FieldHandle';
import type { FieldEnv, FieldExprIR, SlotHandles, FieldHandle } from '../field/types';
import { compilerToRuntimeType } from './typeAdapter';
import type { SignalBridge } from './SignalBridge';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Thrown when trying to get count for an invalid domain slot
 */
export class InvalidDomainSlotError extends Error {
  constructor(public readonly domainSlot: ValueSlot) {
    super(
      `Domain slot ${domainSlot} is invalid. ` +
        `Make sure the domain was properly created by the compiler.`
    );
    this.name = 'InvalidDomainSlotError';
  }
}

/**
 * Thrown when field expression table is not available in IR
 */
export class MissingFieldExprTableError extends Error {
  constructor() {
    super(
      'FieldExprTable is not available in the compiled IR. ' +
        'This likely means the compiler did not emit field expressions yet.'
    );
    this.name = 'MissingFieldExprTableError';
  }
}

// =============================================================================
// CompilerRuntime
// =============================================================================

/**
 * CompilerRuntime Configuration
 */
export interface CompilerRuntimeConfig {
  /**
   * Signal bridge for evaluating signal closures in broadcast nodes.
   * TEMPORARY: Will be replaced with Phase 4 SignalExpr IR evaluator.
   */
  signalBridge?: SignalBridge;

  /**
   * Domain count resolver function.
   * Maps ValueSlot (domain handle) to element count.
   *
   * This is provided by the compiler/runtime integration layer that knows
   * about domain creation.
   */
  getDomainCount: (domainSlot: ValueSlot) => number;

  /**
   * Source fields provider.
   * Provides pre-materialized source fields (e.g., grid positions, element IDs).
   *
   * This is provided by the runtime that manages special domain sources.
   */
  sourceFields?: SourceFields;
}

/**
 * CompilerRuntime - Integration between Compiler IR and Runtime Materializer
 *
 * This class loads a LinkedGraphIR (Pass 8 output) and provides a runtime
 * environment for field materialization.
 *
 * Usage:
 * ```typescript
 * const linkedIR = pass8LinkResolution(...);
 * const runtime = new CompilerRuntime(linkedIR, config);
 *
 * // Materialize a field
 * const buffer = runtime.materializeField({
 *   fieldId: 0,
 *   domainId: 0,
 *   format: 'f32',
 *   layout: 'scalar',
 *   usageTag: 'positions'
 * });
 *
 * // Release buffers at frame end
 * runtime.releaseFrame();
 * ```
 */
export class CompilerRuntime {
  private readonly materializer: FieldMaterializer;
  private readonly env: MaterializerEnv;
  private readonly builder: IRBuilder;
  private readonly config: CompilerRuntimeConfig;

  constructor(linkedIR: LinkedGraphIR, config: CompilerRuntimeConfig) {
    this.builder = linkedIR.builder;
    this.config = config;

    // Extract field expression table from builder
    const fieldExprTable = this.extractFieldExprTable(linkedIR.builder);

    // Convert compiler field nodes to runtime field nodes
    const runtimeFieldNodes = this.convertFieldNodes(fieldExprTable);

    // Create constants table adapter
    const constants = this.createConstantsTable(linkedIR.builder);

    // Create source fields adapter
    const sources = config.sourceFields || {
      get: () => undefined,
    };

    // Create field environment
    const fieldCache = createFieldHandleCache();
    const fieldEnv: FieldEnv = {
      cache: fieldCache,
      domainId: 0, // Will be set per materialization request
      slotHandles: this.createSlotHandles(),
    };

    // Create buffer pool
    const pool = new FieldBufferPool();

    // Create materializer environment
    this.env = {
      pool,
      cache: new Map(),
      fieldEnv,
      fieldNodes: runtimeFieldNodes,
      sigEnv: {
        time: 0, // Will be set per frame
        signalBridge: config.signalBridge,
      },
      sigNodes: [], // TODO: Phase 4 - SignalExpr IR nodes
      constants,
      sources,
      getDomainCount: config.getDomainCount,
    };

    // Create materializer
    this.materializer = new FieldMaterializer(this.env);
  }

  /**
   * Extract FieldExprTable from IRBuilder.
   *
   * NOTE: IRBuilder doesn't expose field table yet in Phase 5.
   * This is a placeholder that will be implemented when IRBuilder
   * adds getProgramIR() or similar method.
   */
  private extractFieldExprTable(builder: IRBuilder): FieldExprTable {
    // TEMPORARY: Access via any cast until IRBuilder exposes field table
    // TODO: Add builder.getFieldExprTable() method to IRBuilder interface
    const builderImpl = builder as any;

    if (!builderImpl.fieldExprs) {
      throw new MissingFieldExprTableError();
    }

    return {
      nodes: builderImpl.fieldExprs,
    };
  }

  /**
   * Convert compiler FieldExprIR nodes to runtime FieldExprIR nodes.
   *
   * This mainly involves type conversion from compiler TypeDesc to runtime TypeDesc.
   */
  private convertFieldNodes(fieldExprTable: FieldExprTable): FieldExprIR[] {
    return fieldExprTable.nodes.map((node) => {
      // Convert the type
      const runtimeType = compilerToRuntimeType(node.type);

      // Create runtime node with converted type
      // The node structure is the same, just with runtime TypeDesc
      return {
        ...node,
        type: runtimeType,
      } as FieldExprIR;
    });
  }

  /**
   * Create ConstantsTable adapter from IRBuilder.
   */
  private createConstantsTable(builder: IRBuilder): ConstantsTable {
    // TEMPORARY: Access via any cast until IRBuilder exposes const pool
    const builderImpl = builder as any;

    return {
      get: (constId: number): number => {
        if (!builderImpl.constPool || constId >= builderImpl.constPool.length) {
          throw new Error(`Constant ${constId} not found in const pool`);
        }
        const value = builderImpl.constPool[constId];

        // Ensure it's a number
        if (typeof value !== 'number') {
          throw new Error(
            `Constant ${constId} is not a number (got ${typeof value})`
          );
        }

        return value;
      },
    };
  }

  /**
   * Create SlotHandles adapter.
   *
   * This is a placeholder for Phase 6 when we have proper slot resolution.
   * For now, it throws an error since we don't have input slots yet.
   */
  private createSlotHandles(): SlotHandles {
    return {
      read: (slot) => {
        throw new Error(
          `InputSlot ${JSON.stringify(slot)} resolution not yet implemented. ` +
            `This will be added in Phase 6 when block composition is complete.`
        );
      },
    };
  }

  /**
   * Update time for signal evaluation.
   *
   * This should be called at the start of each frame before materialization.
   *
   * @param timeMs - Current time in milliseconds
   */
  setTime(timeMs: number): void {
    this.env.sigEnv.time = timeMs;
  }

  /**
   * Update domain ID for field environment.
   *
   * This should be called before materializing fields from a different domain.
   *
   * @param domainId - Domain ID to set
   */
  setDomain(domainId: number): void {
    this.env.fieldEnv.domainId = domainId;
  }

  /**
   * Materialize a field to a typed array.
   *
   * This is the main API for runtime field materialization.
   * It delegates to the FieldMaterializer which handles caching and buffer pooling.
   *
   * @param request - Materialization request
   * @returns Typed array with materialized field data
   */
  materializeField(request: {
    fieldId: number;
    domainId: number;
    format: string;
    layout: string;
    usageTag: string;
  }): ArrayBufferView {
    // Ensure domain is set correctly
    this.setDomain(request.domainId);

    // Delegate to materializer
    return this.materializer.materialize(request as any);
  }

  /**
   * Release buffers back to pool at frame end.
   *
   * This should be called at the end of each frame to recycle buffers.
   */
  releaseFrame(): void {
    this.materializer.releaseFrame();
  }

  /**
   * Advance to next frame.
   *
   * This increments the frame cache counter, invalidating cached handles.
   */
  advanceFrame(): void {
    this.env.fieldEnv.cache.frameId++;
  }

  /**
   * Get the MaterializerEnv for advanced use cases.
   *
   * This exposes the full environment for direct materialization if needed.
   */
  getEnv(): MaterializerEnv {
    return this.env;
  }

  /**
   * Get the IRBuilder for accessing other IR tables.
   *
   * This is useful for accessing signal expressions, bus tables, etc.
   */
  getBuilder(): IRBuilder {
    return this.builder;
  }
}
