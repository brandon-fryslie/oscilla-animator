/**
 * Domain Block Compilers
 *
 * Block compilers for the Domain-based primitives (Phase 3).
 * These blocks work with Domain for per-element identity and Field<T> for per-element data.
 */

export { DomainNBlock } from './DomainN';
export { GridDomainBlock } from './GridDomain';
export { SVGSampleDomainBlock } from './SVGSampleDomain';
export { PositionMapGridBlock } from './PositionMapGrid';
export { PositionMapCircleBlock } from './PositionMapCircle';
export { PositionMapLineBlock } from './PositionMapLine';
export { FieldConstNumberBlock } from './FieldConstNumber';
export { FieldConstColorBlock } from './FieldConstColor';
export { FieldHash01ByIdBlock } from './FieldHash01ById';
export { StableIdHashBlock } from './StableIdHash';
export { FieldMapNumberBlock } from './FieldMapNumber';
export { FieldMapVec2Block } from './FieldMapVec2';
export { FieldZipNumberBlock } from './FieldZipNumber';
export { PhaseClockBlock } from './PhaseClock';
export { TriggerOnWrapBlock } from './TriggerOnWrap';
export { RenderInstances2DBlock } from './RenderInstances2D';
export { RenderPaths2DBlock } from './RenderPaths2D';
export { Render2dCanvasBlock } from './Render2dCanvas';
export { PathConstBlock } from './PathConst';

// TimeRoot blocks (Phase 3: TimeRoot)
export {
  FiniteTimeRootBlock,
  InfiniteTimeRootBlock,
} from './TimeRoot';

// Field manipulation blocks (Slices 4-8)
export { FieldAddVec2Block } from './FieldAddVec2';
export { FieldColorizeBlock } from './FieldColorize';
export { FieldOpacityBlock } from './FieldOpacity';
export { FieldHueGradientBlock } from './FieldHueGradient';
export { FieldFromExpressionBlock } from './FieldFromExpression';
export { FieldStringToColorBlock } from './FieldStringToColor';
export { ViewportInfoBlock } from './ViewportInfo';
export { JitterFieldVec2Block } from './JitterFieldVec2';

// Field-Signal combination blocks (Slice 5)
export { FieldFromSignalBroadcastBlock } from './FieldFromSignalBroadcast';
export { FieldZipSignalBlock } from './FieldZipSignal';
