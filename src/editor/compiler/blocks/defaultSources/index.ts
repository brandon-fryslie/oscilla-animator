/**
 * Default Source Provider Block Compilers
 *
 * These blocks are hidden providers that supply default values for undriven inputs.
 * They are injected at compile-time and never appear in the UI.
 *
 * Sprint 4: DSConstSignalFloat (reference implementation)
 * Sprint 5: Remaining 8 const provider blocks
 * Current: Added DSConstSignalPhase and DSConstSignalTime
 */

export { DSConstSignalFloatBlock } from './DSConstSignalFloat';
export { DSConstSignalIntBlock } from './DSConstSignalInt';
export { DSConstSignalColorBlock } from './DSConstSignalColor';
export { DSConstSignalPointBlock } from './DSConstSignalPoint';
export { DSConstSignalPhaseBlock } from './DSConstSignalPhase';
export { DSConstSignalTimeBlock } from './DSConstSignalTime';
export { DSConstFieldFloatBlock } from './DSConstFieldFloat';
export { DSConstFieldVec2Block } from './DSConstFieldVec2';
export { DSConstFieldColorBlock } from './DSConstFieldColor';
export { DSConstScalarStringBlock } from './DSConstScalarString';
export { DSConstScalarWaveformBlock } from './DSConstScalarWaveform';
export { DSConstScalarIntBlock } from './DSConstScalarInt';
export { DSConstScalarFloatBlock } from './DSConstScalarFloat';
