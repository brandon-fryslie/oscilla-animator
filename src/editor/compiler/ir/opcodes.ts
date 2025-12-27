/**
 * OpCode Registry
 *
 * Enum and metadata for all VM operations.
 * Blocks are NOT opcodes - blocks compile to opcode sequences.
 *
 * References:
 * - design-docs/12-Compiler-Final/11-Opcode-Taxonomy.md
 * - design-docs/13-Renderer/06-3d-IR-Deltas.md (3D opcodes)
 * - HANDOFF.md Topic 6: Opcode Registry
 */

import type { TypeDesc } from "./types";

// =============================================================================
// OpCode Definition
// =============================================================================

/**
 * Operation codes for the VM.
 *
 * Numeric groupings:
 * - 0-9: Constants
 * - 10-19: Time operations
 * - 100-139: Pure math (scalar)
 * - 200-219: Vec2 operations
 * - 300-319: Color operations
 * - 400-419: State operations
 * - 500-519: Domain/Identity operations
 * - 600-619: Field operations
 * - 700-719: Render operations
 * - 720-729: 3D operations (camera, mesh, projection)
 * - 800-819: Transform operations
 */
export const OpCode = {
  // Constants (0-9)
  Const: 0,

  // Time (10-19) - canonical signals from TimeRoot
  TimeAbsMs: 10,
  TimeModelMs: 11,
  Phase01: 12,
  TimeDelta: 13,
  WrapEvent: 14,

  // Pure Math - Scalar (100-139)
  // Binary arithmetic
  Add: 100,
  Sub: 101,
  Mul: 102,
  Div: 103,
  Mod: 104,
  Pow: 105,

  // Trigonometry
  Sin: 110,
  Cos: 111,
  Tan: 112,
  Asin: 113,
  Acos: 114,
  Atan: 115,
  Atan2: 116,

  // Rounding
  Abs: 120,
  Floor: 121,
  Ceil: 122,
  Round: 123,
  Fract: 124,
  Sign: 125,

  // Comparison/Selection
  Min: 130,
  Max: 131,
  Clamp: 132,
  Lerp: 133,
  Step: 134,
  Smoothstep: 135,

  // Vec2 (200-219)
  Vec2Add: 200,
  Vec2Sub: 201,
  Vec2Mul: 202,
  Vec2Div: 203,
  Vec2Scale: 204,
  Vec2Dot: 210,
  Vec2Length: 211,
  Vec2Normalize: 212,
  Vec2Rotate: 213,
  Vec2Angle: 214,

  // Color (300-319)
  ColorLerp: 300,
  ColorHSLToRGB: 301,
  ColorRGBToHSL: 302,
  ColorShiftHue: 303,
  ColorScaleLight: 304,
  ColorScaleSat: 305,

  // State (400-419) - explicit state, no closures
  Integrate: 400,
  DelayMs: 401,
  DelayFrames: 402,
  SampleHold: 403,
  Slew: 404,
  EdgeDetectWrap: 405,

  // Domain/Identity (500-519)
  DomainN: 500,
  DomainFromSVG: 501,
  Hash01ById: 510,
  IndexById: 511,

  // Field (600-619)
  FieldMap: 600,
  FieldZip: 601,
  FieldReduce: 602,
  FieldBroadcast: 603,
  FieldFilter: 604,

  // Render (700-719)
  RenderInstances2D: 700,
  RenderPath: 701,
  RenderRect: 702,
  RenderCircle: 703,

  // 3D Operations (720-729) - camera, mesh, projection
  CameraEval: 720,
  MeshMaterialize: 721,
  Instances3DProjectTo2D: 722,

  // Transform (800-819)
  TransformScale: 800,
  TransformBias: 801,
  TransformEase: 802,
  TransformQuantize: 803,
  TransformNormalize: 804,
} as const;

export type OpCode = (typeof OpCode)[keyof typeof OpCode];

// =============================================================================
// OpCode Metadata
// =============================================================================

/**
 * Category grouping for opcodes.
 */
export type OpCodeCategory =
  | "const"
  | "time"
  | "math"
  | "vec"
  | "color"
  | "state"
  | "domain"
  | "field"
  | "render"
  | "3d"
  | "transform";

/**
 * Purity classification for operations.
 */
export type OpCodePurity =
  | "pure" // No side effects, deterministic
  | "stateful" // Reads/writes state
  | "io"; // I/O operations

/**
 * Metadata for an OpCode.
 */
export interface OpCodeMeta {
  /** The opcode value */
  opcode: OpCode;

  /** Human-readable name */
  name: string;

  /** Category for grouping */
  category: OpCodeCategory;

  /** Input type descriptors */
  inputTypes: TypeDesc[];

  /** Output type descriptor */
  outputType: TypeDesc;

  /** Purity classification */
  purity: OpCodePurity;

  /** Optional description */
  description?: string;
}

// =============================================================================
// Common TypeDesc Helpers
// =============================================================================

const numberSignal: TypeDesc = {
  world: "signal",
  domain: "number",
};

const vec2Signal: TypeDesc = {
  world: "signal",
  domain: "vec2",
};

const colorSignal: TypeDesc = {
  world: "signal",
  domain: "color",
};

const triggerSignal: TypeDesc = {
  world: "signal",
  domain: "trigger",
};

const phaseSignal: TypeDesc = {
  world: "signal",
  domain: "phase01",
};

const timeSignal: TypeDesc = {
  world: "signal",
  domain: "timeMs",
};

const numberField: TypeDesc = {
  world: "field",
  domain: "number",
};

const mat4Field: TypeDesc = {
  world: "field",
  domain: "mat4",
};

const colorField: TypeDesc = {
  world: "field",
  domain: "color",
};

const renderTreeSpecial: TypeDesc = {
  world: "special",
  domain: "renderTree",
};

const renderCmdsSpecial: TypeDesc = {
  world: "special",
  domain: "renderCmds",
};

const cameraSpecial: TypeDesc = {
  world: "special",
  domain: "camera",
};

const meshSpecial: TypeDesc = {
  world: "special",
  domain: "mesh",
};

const domainSpecial: TypeDesc = {
  world: "special",
  domain: "domain",
};

// =============================================================================
// OpCode Registry
// =============================================================================

/**
 * Registry mapping each OpCode to its metadata.
 * This enables dispatch tables and Rust translation.
 */
export const OPCODE_REGISTRY: Record<OpCode, OpCodeMeta> = {
  // Constants
  [OpCode.Const]: {
    opcode: OpCode.Const,
    name: "const",
    category: "const",
    inputTypes: [],
    outputType: numberSignal, // Generic, actual type from const pool
    purity: "pure",
    description: "Constant value from const pool",
  },

  // Time
  [OpCode.TimeAbsMs]: {
    opcode: OpCode.TimeAbsMs,
    name: "timeAbsMs",
    category: "time",
    inputTypes: [],
    outputType: timeSignal,
    purity: "pure",
    description: "Absolute time in milliseconds",
  },

  [OpCode.TimeModelMs]: {
    opcode: OpCode.TimeModelMs,
    name: "timeModelMs",
    category: "time",
    inputTypes: [],
    outputType: timeSignal,
    purity: "pure",
    description: "Time model time in milliseconds",
  },

  [OpCode.Phase01]: {
    opcode: OpCode.Phase01,
    name: "phase01",
    category: "time",
    inputTypes: [],
    outputType: phaseSignal,
    purity: "pure",
    description: "Phase signal [0,1] for cyclic time models",
  },

  [OpCode.TimeDelta]: {
    opcode: OpCode.TimeDelta,
    name: "timeDelta",
    category: "time",
    inputTypes: [],
    outputType: numberSignal,
    purity: "pure",
    description: "Delta time between frames",
  },

  [OpCode.WrapEvent]: {
    opcode: OpCode.WrapEvent,
    name: "wrapEvent",
    category: "time",
    inputTypes: [],
    outputType: triggerSignal,
    purity: "pure",
    description: "Trigger on phase wrap for cyclic time models",
  },

  // Pure Math - Binary
  [OpCode.Add]: {
    opcode: OpCode.Add,
    name: "add",
    category: "math",
    inputTypes: [numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Addition: a + b",
  },

  [OpCode.Sub]: {
    opcode: OpCode.Sub,
    name: "sub",
    category: "math",
    inputTypes: [numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Subtraction: a - b",
  },

  [OpCode.Mul]: {
    opcode: OpCode.Mul,
    name: "mul",
    category: "math",
    inputTypes: [numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Multiplication: a * b",
  },

  [OpCode.Div]: {
    opcode: OpCode.Div,
    name: "div",
    category: "math",
    inputTypes: [numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Division: a / b",
  },

  [OpCode.Mod]: {
    opcode: OpCode.Mod,
    name: "mod",
    category: "math",
    inputTypes: [numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Modulo: a % b",
  },

  [OpCode.Pow]: {
    opcode: OpCode.Pow,
    name: "pow",
    category: "math",
    inputTypes: [numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Power: a ^ b",
  },

  // Trigonometry
  [OpCode.Sin]: {
    opcode: OpCode.Sin,
    name: "sin",
    category: "math",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Sine function (radians)",
  },

  [OpCode.Cos]: {
    opcode: OpCode.Cos,
    name: "cos",
    category: "math",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Cosine function (radians)",
  },

  [OpCode.Tan]: {
    opcode: OpCode.Tan,
    name: "tan",
    category: "math",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Tangent function (radians)",
  },

  [OpCode.Asin]: {
    opcode: OpCode.Asin,
    name: "asin",
    category: "math",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Arcsine function",
  },

  [OpCode.Acos]: {
    opcode: OpCode.Acos,
    name: "acos",
    category: "math",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Arccosine function",
  },

  [OpCode.Atan]: {
    opcode: OpCode.Atan,
    name: "atan",
    category: "math",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Arctangent function",
  },

  [OpCode.Atan2]: {
    opcode: OpCode.Atan2,
    name: "atan2",
    category: "math",
    inputTypes: [numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Two-argument arctangent",
  },

  // Rounding
  [OpCode.Abs]: {
    opcode: OpCode.Abs,
    name: "abs",
    category: "math",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Absolute value",
  },

  [OpCode.Floor]: {
    opcode: OpCode.Floor,
    name: "floor",
    category: "math",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Floor function",
  },

  [OpCode.Ceil]: {
    opcode: OpCode.Ceil,
    name: "ceil",
    category: "math",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Ceiling function",
  },

  [OpCode.Round]: {
    opcode: OpCode.Round,
    name: "round",
    category: "math",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Round to nearest integer",
  },

  [OpCode.Fract]: {
    opcode: OpCode.Fract,
    name: "fract",
    category: "math",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Fractional part",
  },

  [OpCode.Sign]: {
    opcode: OpCode.Sign,
    name: "sign",
    category: "math",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Sign function (-1, 0, 1)",
  },

  // Comparison/Selection
  [OpCode.Min]: {
    opcode: OpCode.Min,
    name: "min",
    category: "math",
    inputTypes: [numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Minimum of two values",
  },

  [OpCode.Max]: {
    opcode: OpCode.Max,
    name: "max",
    category: "math",
    inputTypes: [numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Maximum of two values",
  },

  [OpCode.Clamp]: {
    opcode: OpCode.Clamp,
    name: "clamp",
    category: "math",
    inputTypes: [numberSignal, numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Clamp value between min and max",
  },

  [OpCode.Lerp]: {
    opcode: OpCode.Lerp,
    name: "lerp",
    category: "math",
    inputTypes: [numberSignal, numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Linear interpolation",
  },

  [OpCode.Step]: {
    opcode: OpCode.Step,
    name: "step",
    category: "math",
    inputTypes: [numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Step function",
  },

  [OpCode.Smoothstep]: {
    opcode: OpCode.Smoothstep,
    name: "smoothstep",
    category: "math",
    inputTypes: [numberSignal, numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Smooth step interpolation",
  },

  // Vec2
  [OpCode.Vec2Add]: {
    opcode: OpCode.Vec2Add,
    name: "vec2Add",
    category: "vec",
    inputTypes: [vec2Signal, vec2Signal],
    outputType: vec2Signal,
    purity: "pure",
    description: "Vec2 addition",
  },

  [OpCode.Vec2Sub]: {
    opcode: OpCode.Vec2Sub,
    name: "vec2Sub",
    category: "vec",
    inputTypes: [vec2Signal, vec2Signal],
    outputType: vec2Signal,
    purity: "pure",
    description: "Vec2 subtraction",
  },

  [OpCode.Vec2Mul]: {
    opcode: OpCode.Vec2Mul,
    name: "vec2Mul",
    category: "vec",
    inputTypes: [vec2Signal, vec2Signal],
    outputType: vec2Signal,
    purity: "pure",
    description: "Vec2 component-wise multiplication",
  },

  [OpCode.Vec2Div]: {
    opcode: OpCode.Vec2Div,
    name: "vec2Div",
    category: "vec",
    inputTypes: [vec2Signal, vec2Signal],
    outputType: vec2Signal,
    purity: "pure",
    description: "Vec2 component-wise division",
  },

  [OpCode.Vec2Scale]: {
    opcode: OpCode.Vec2Scale,
    name: "vec2Scale",
    category: "vec",
    inputTypes: [vec2Signal, numberSignal],
    outputType: vec2Signal,
    purity: "pure",
    description: "Vec2 scalar multiplication",
  },

  [OpCode.Vec2Dot]: {
    opcode: OpCode.Vec2Dot,
    name: "vec2Dot",
    category: "vec",
    inputTypes: [vec2Signal, vec2Signal],
    outputType: numberSignal,
    purity: "pure",
    description: "Vec2 dot product",
  },

  [OpCode.Vec2Length]: {
    opcode: OpCode.Vec2Length,
    name: "vec2Length",
    category: "vec",
    inputTypes: [vec2Signal],
    outputType: numberSignal,
    purity: "pure",
    description: "Vec2 length/magnitude",
  },

  [OpCode.Vec2Normalize]: {
    opcode: OpCode.Vec2Normalize,
    name: "vec2Normalize",
    category: "vec",
    inputTypes: [vec2Signal],
    outputType: vec2Signal,
    purity: "pure",
    description: "Vec2 normalization",
  },

  [OpCode.Vec2Rotate]: {
    opcode: OpCode.Vec2Rotate,
    name: "vec2Rotate",
    category: "vec",
    inputTypes: [vec2Signal, numberSignal],
    outputType: vec2Signal,
    purity: "pure",
    description: "Vec2 rotation by angle (radians)",
  },

  [OpCode.Vec2Angle]: {
    opcode: OpCode.Vec2Angle,
    name: "vec2Angle",
    category: "vec",
    inputTypes: [vec2Signal],
    outputType: numberSignal,
    purity: "pure",
    description: "Vec2 angle from x-axis",
  },

  // Color
  [OpCode.ColorLerp]: {
    opcode: OpCode.ColorLerp,
    name: "colorLerp",
    category: "color",
    inputTypes: [colorSignal, colorSignal, numberSignal],
    outputType: colorSignal,
    purity: "pure",
    description: "Color interpolation",
  },

  [OpCode.ColorHSLToRGB]: {
    opcode: OpCode.ColorHSLToRGB,
    name: "colorHSLToRGB",
    category: "color",
    inputTypes: [colorSignal],
    outputType: colorSignal,
    purity: "pure",
    description: "Convert HSL to RGB",
  },

  [OpCode.ColorRGBToHSL]: {
    opcode: OpCode.ColorRGBToHSL,
    name: "colorRGBToHSL",
    category: "color",
    inputTypes: [colorSignal],
    outputType: colorSignal,
    purity: "pure",
    description: "Convert RGB to HSL",
  },

  [OpCode.ColorShiftHue]: {
    opcode: OpCode.ColorShiftHue,
    name: "colorShiftHue",
    category: "color",
    inputTypes: [colorSignal, numberSignal],
    outputType: colorSignal,
    purity: "pure",
    description: "Shift hue by angle",
  },

  [OpCode.ColorScaleLight]: {
    opcode: OpCode.ColorScaleLight,
    name: "colorScaleLight",
    category: "color",
    inputTypes: [colorSignal, numberSignal],
    outputType: colorSignal,
    purity: "pure",
    description: "Scale lightness",
  },

  [OpCode.ColorScaleSat]: {
    opcode: OpCode.ColorScaleSat,
    name: "colorScaleSat",
    category: "color",
    inputTypes: [colorSignal, numberSignal],
    outputType: colorSignal,
    purity: "pure",
    description: "Scale saturation",
  },

  // State - stateful operations with explicit state
  [OpCode.Integrate]: {
    opcode: OpCode.Integrate,
    name: "integrate",
    category: "state",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "stateful",
    description: "Integrate input over time (accumulator)",
  },

  [OpCode.DelayMs]: {
    opcode: OpCode.DelayMs,
    name: "delayMs",
    category: "state",
    inputTypes: [numberSignal, numberSignal], // value, delayMs
    outputType: numberSignal,
    purity: "stateful",
    description: "Time-based delay",
  },

  [OpCode.DelayFrames]: {
    opcode: OpCode.DelayFrames,
    name: "delayFrames",
    category: "state",
    inputTypes: [numberSignal, numberSignal], // value, frameCount
    outputType: numberSignal,
    purity: "stateful",
    description: "Frame-based delay",
  },

  [OpCode.SampleHold]: {
    opcode: OpCode.SampleHold,
    name: "sampleHold",
    category: "state",
    inputTypes: [numberSignal, triggerSignal],
    outputType: numberSignal,
    purity: "stateful",
    description: "Sample and hold on trigger",
  },

  [OpCode.Slew]: {
    opcode: OpCode.Slew,
    name: "slew",
    category: "state",
    inputTypes: [numberSignal, numberSignal], // value, rate
    outputType: numberSignal,
    purity: "stateful",
    description: "Slew rate limiter (smoothing)",
  },

  [OpCode.EdgeDetectWrap]: {
    opcode: OpCode.EdgeDetectWrap,
    name: "edgeDetectWrap",
    category: "state",
    inputTypes: [phaseSignal],
    outputType: triggerSignal,
    purity: "stateful",
    description: "Detect phase wrap event",
  },

  // Domain/Identity
  [OpCode.DomainN]: {
    opcode: OpCode.DomainN,
    name: "domainN",
    category: "domain",
    inputTypes: [numberSignal],
    outputType: numberField,
    purity: "pure",
    description: "Create domain of N elements",
  },

  [OpCode.DomainFromSVG]: {
    opcode: OpCode.DomainFromSVG,
    name: "domainFromSVG",
    category: "domain",
    inputTypes: [],
    outputType: { world: "field", domain: "path" },
    purity: "io",
    description: "Load domain from SVG",
  },

  [OpCode.Hash01ById]: {
    opcode: OpCode.Hash01ById,
    name: "hash01ById",
    category: "domain",
    inputTypes: [],
    outputType: numberField,
    purity: "pure",
    description: "Hash element ID to [0,1]",
  },

  [OpCode.IndexById]: {
    opcode: OpCode.IndexById,
    name: "indexById",
    category: "domain",
    inputTypes: [],
    outputType: numberField,
    purity: "pure",
    description: "Get element index",
  },

  // Field
  [OpCode.FieldMap]: {
    opcode: OpCode.FieldMap,
    name: "fieldMap",
    category: "field",
    inputTypes: [numberField],
    outputType: numberField,
    purity: "pure",
    description: "Map function over field",
  },

  [OpCode.FieldZip]: {
    opcode: OpCode.FieldZip,
    name: "fieldZip",
    category: "field",
    inputTypes: [numberField, numberField],
    outputType: numberField,
    purity: "pure",
    description: "Zip two fields",
  },

  [OpCode.FieldReduce]: {
    opcode: OpCode.FieldReduce,
    name: "fieldReduce",
    category: "field",
    inputTypes: [numberField],
    outputType: numberSignal,
    purity: "pure",
    description: "Reduce field to scalar",
  },

  [OpCode.FieldBroadcast]: {
    opcode: OpCode.FieldBroadcast,
    name: "fieldBroadcast",
    category: "field",
    inputTypes: [numberSignal],
    outputType: numberField,
    purity: "pure",
    description: "Broadcast scalar to field",
  },

  [OpCode.FieldFilter]: {
    opcode: OpCode.FieldFilter,
    name: "fieldFilter",
    category: "field",
    inputTypes: [numberField, { world: "field", domain: "boolean" }],
    outputType: numberField,
    purity: "pure",
    description: "Filter field by predicate",
  },

  // Render
  [OpCode.RenderInstances2D]: {
    opcode: OpCode.RenderInstances2D,
    name: "renderInstances2D",
    category: "render",
    inputTypes: [],
    outputType: renderTreeSpecial,
    purity: "io",
    description: "2D instanced rendering",
  },

  [OpCode.RenderPath]: {
    opcode: OpCode.RenderPath,
    name: "renderPath",
    category: "render",
    inputTypes: [],
    outputType: renderTreeSpecial,
    purity: "io",
    description: "Path rendering",
  },

  [OpCode.RenderRect]: {
    opcode: OpCode.RenderRect,
    name: "renderRect",
    category: "render",
    inputTypes: [],
    outputType: renderTreeSpecial,
    purity: "io",
    description: "Rectangle rendering",
  },

  [OpCode.RenderCircle]: {
    opcode: OpCode.RenderCircle,
    name: "renderCircle",
    category: "render",
    inputTypes: [],
    outputType: renderTreeSpecial,
    purity: "io",
    description: "Circle rendering",
  },

  // 3D Operations (design-docs/13-Renderer/06-3d-IR-Deltas.md §7.1)
  [OpCode.CameraEval]: {
    opcode: OpCode.CameraEval,
    name: "cameraEval",
    category: "3d",
    inputTypes: [cameraSpecial],
    outputType: cameraSpecial,
    purity: "pure",
    description: "Evaluate camera to view/projection matrices",
  },

  [OpCode.MeshMaterialize]: {
    opcode: OpCode.MeshMaterialize,
    name: "meshMaterialize",
    category: "3d",
    inputTypes: [meshSpecial],
    outputType: meshSpecial,
    purity: "pure",
    description: "Materialize mesh from procedural recipe",
  },

  [OpCode.Instances3DProjectTo2D]: {
    opcode: OpCode.Instances3DProjectTo2D,
    name: "instances3DProjectTo2D",
    category: "3d",
    inputTypes: [domainSpecial, cameraSpecial, mat4Field, colorField, numberField],
    outputType: renderCmdsSpecial,
    purity: "pure",
    description: "Project 3D instances to 2D for Canvas rendering",
  },

  // Transform
  [OpCode.TransformScale]: {
    opcode: OpCode.TransformScale,
    name: "transformScale",
    category: "transform",
    inputTypes: [numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Scale transform",
  },

  [OpCode.TransformBias]: {
    opcode: OpCode.TransformBias,
    name: "transformBias",
    category: "transform",
    inputTypes: [numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Bias transform",
  },

  [OpCode.TransformEase]: {
    opcode: OpCode.TransformEase,
    name: "transformEase",
    category: "transform",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Easing curve transform",
  },

  [OpCode.TransformQuantize]: {
    opcode: OpCode.TransformQuantize,
    name: "transformQuantize",
    category: "transform",
    inputTypes: [numberSignal, numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Quantization transform",
  },

  [OpCode.TransformNormalize]: {
    opcode: OpCode.TransformNormalize,
    name: "transformNormalize",
    category: "transform",
    inputTypes: [numberSignal],
    outputType: numberSignal,
    purity: "pure",
    description: "Normalization transform",
  },
};
