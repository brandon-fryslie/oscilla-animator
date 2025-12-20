/**
 * Block Compilers
 *
 * Re-exports from modular blocks/ directory for backwards compatibility.
 * Legacy blocks have been moved to blocks/legacy/.
 *
 * @see blocks/index.ts for the registry and organization
 */

export {
  DEFAULT_BLOCK_REGISTRY,
  createBlockRegistry,
  registerDynamicBlock,
} from './blocks/index';

// Re-export domain blocks and helpers
export * from './blocks/domain';
export * from './blocks/helpers';
