Below are six example “programs” at the patch level (blocks + IO), and then a single Canvas renderer that can render all of them (circles, squares, stars, paths, layers, transforms), not “circles only”.

I’m going to assume the architecture we’ve been designing:
•	Patch builds a RenderTree / RenderCmds value.
•	Render2dCanvas is a sink: input scene: RenderTree → draws.
•	Identity is Domain + per-element Fields (Field<T> or FieldExpr<T>).
•	Time comes from TimeRoot → core signals like phaseA, phaseB, pulse, energy (or whatever you ended up calling them), plus user buses.

⸻

Canonical generic blocks (the “vocabulary”)

Identity & sampling
•	DomainN: params count → out domain: Domain
•	SplitDomain: in domain + ratio|mask → out a: Domain, b: Domain (stable partition)
•	Hash01: in domain (+seed) → out Field<number 0..1>
•	DomainPositions (optional convenience): in domain → out Field<vec2> (stable random positions)

Time & modulation
•	TimeRoot: out Signal<timeMs>, plus derived Signal<phase01>, Signal<trigger> etc.
•	Osc01 / LFO / Noise1D: in Signal<time> or Signal<phase> → out Signal<number 0..1> or Signal<number>
•	PulseToEnvelope: in Signal<trigger> → out Signal<number 0..1> (attack/decay)
•	PhaseToAngle: in phase01 → out Signal<number radians>

Field operators (pure, cheap, reusable)
•	Broadcast: in Signal<T> → out Field<T> (per-element same value)
•	MapField: in Field<A> + fn → out Field<B>
•	ZipField: in Field<A>, Field<B> + fn → out Field<C>
•	Rotate2D / PolarToXY / Add2 / Mul / Clamp / Ease: scalar/signal/field variants

Geometry builders (produce RenderTree, not draw)
•	Instances2D:
in:
•	domain: Domain
•	glyph: Field<Glyph2D> (or Scalar<Glyph2D> broadcasted)
•	xform: Field<Transform2D> (or pos/rot/scale fields)
•	style: Field<Style2D>
out: render: RenderTree
•	PathStrip2D (for visualizer paths):
in points: Field<vec2> (ordered), style: Signal|Field<Style2D> → out render
•	Group: in children: RenderTree[], blend/mode → out render
•	Effect2D (optional): in render + EffectSpec → out render

Render sink
•	Render2dCanvas: in scene: RenderTree, target, settings → draws

⸻

Program 1: Spiral-ish swirling particles + color fades

Goal: particles orbit a center with a spiral drift; color cycles smoothly.

Blocks
1.	TimeRoot → phaseA: Signal<phase01>, maybe energy: Signal<unit01>
2.	DomainN(count=N) → domain
3.	Hash01(domain) → h: Field<unit01> (unique per element)
4.	Motion:
•	angle = phaseA*TAU + h*TAU*k (k = “spread”) → Field<number> (via Broadcast+Zip)
•	radius = base + h*spread + wobble(phaseA,h) → Field<number>
•	pos = PolarToXY(radius, angle) + center → Field<vec2>
5.	Color:
•	hue = phaseA + h (wrapped 0..1) → Field<number>
•	color = HSV(hue, sat, val) → Field<color>
6.	glyph = const Circle → Field<Glyph2D> (broadcast)
7.	xform = FromPosScale(pos, size) → Field<Transform2D>
8.	style = Fill(color, alpha) → Field<Style2D>
9.	Instances2D(domain, glyph, xform, style) → RenderTree
10.	Render2dCanvas(scene)

Key IO
•	Instances2D: domain, glyph, xform, style -> render
•	You can reuse 90% of this for any “flying things” patch.

⸻

Program 2: Swirl + letters appear temporarily (half particles form glyphs)

Goal: split particles into two stable groups; one group snaps to letter point targets during an envelope window.

Blocks
1.	TimeRoot provides phaseA and pulse (or a trigger every bar)
2.	DomainN(N) → domain
3.	SplitDomain(domain, ratio=0.5, stable=true) → domainLetters, domainSwirl
4.	Swirl positions (same as Program 1) but using domainSwirl
5.	Letter targets:
•	TextToPoints("HELLO", font, pointCount=|domainLetters|) → Field<vec2> in the letter-domain order
•	or SampleGlyphPathToPoints(glyphAssetId) for non-text
6.	Envelope:
•	env = PulseToEnvelope(pulse, attack, hold, decay) → Signal<number 0..1>
•	envF = Broadcast(env) → Field<number>
7.	Blend:
•	posLetters = Lerp(swirlPosLetters, textPoints, envF)
Where swirlPosLetters is computed like Program 1 but over domainLetters
8.	Colors:
•	swirl group: cycling
•	letters group: either same palette, or boosted alpha/brightness during env
9.	Build:
•	Instances2D(domainSwirl, ...) → renderA
•	Instances2D(domainLetters, ...) → renderB
•	Group([renderA, renderB]) → render
10.	Render2dCanvas

Consistency/reuse
•	SplitDomain is the reusable primitive: it gives you stable “ensembles” without ever creating new identity.
•	TextToPoints (or glyph-to-points) is reusable for a lot of “form a thing briefly” effects.

⸻

Program 3: Morphing paths like a music visualizer

Goal: animated polyline(s) where the path shape evolves over time.

Blocks
1.	TimeRoot → phaseA
2.	AudioSpectrum (or FakeSpectrum generator if no audio yet) → Signal<Array<number>> or Signal<Field<number>> depending on design
3.	DomainN(M) for samples along the path → domain
4.	index = DomainIndex(domain) → Field<number> in 0..M-1
5.	x = map(index -> [-1..1]) → Field<number>
6.	amp = spectrumAt(index) or noise if no audio → Field<number>
7.	y = amp * scale + wobble(phaseA, index) → Field<number>
8.	points = PackVec2(x,y) -> Field<vec2>
9.	PathStrip2D(points, style) → render
10.	Render2dCanvas

Key IO
•	PathStrip2D(points: Field<vec2>, style) -> RenderTree
•	This keeps the renderer dumb: it only draws a path command.

⸻

Program 4: “2D mapping” UI where user can place circles

Goal: user directly controls positions (e.g., drag points); patch consumes that without bespoke renderer logic.

Blocks
1.	DomainN(N) → domain
2.	UIControlPoints(domain) → Field<vec2> (authoritative user-edited positions)
•	internally backed by a persisted per-domain table keyed by element id
3.	Optional: UIControlColors(domain) → Field<color> or Scalar palette + mapping
4.	Instances2D(domain, CircleGlyph, xformFromPos, style) → render
5.	Render2dCanvas

Consistency/reuse
•	Treat “user mapping” as just another IO block producing fields keyed by domain.
•	Everything downstream is identical to generative cases.

⸻

Program 5: Mixed shapes (circles + squares + stars) all flying around

Goal: different glyph per element, still one instancing pass (or a few passes) without special-casing renderer.

Blocks
1.	DomainN(N) → domain
2.	h = Hash01(domain) → Field
3.	glyph = ChooseGlyph(h) → Field
•	if h<0.33 circle, else if <0.66 square, else star(5 points)
4.	Motion fields: pos/rot/scale as usual
5.	style fields
6.	Instances2D(domain, glyph, xform, style) → render
7.	Render2dCanvas

If you want different blending/material rules per glyph kind, split:
•	MaskByGlyphKind → three domains or three masks
•	three Instances2D → Group

⸻

Program 6: Static test with colors swirling

Goal: no motion, just color phase swirl.

Blocks
1.	TimeRoot → phaseA
2.	DomainN(N) or GridPoints(domain) if you have it
3.	pos = GridPositions(domain) → Field (static)
4.	hue = phaseA + f(pos) → Field
5.	style = Fill(HSV(hue,...))
6.	Instances2D → render
7.	Render2dCanvas

⸻

“Keep things consistent and reusable” (the rules)
1.	Always key variation off domain (hash, index, stable partitions).
Never “random() in the renderer”.
2.	RenderTree is the only boundary between patch content and drawing.
Renderer never sees radius unless “circle glyph” is an explicit RenderCmd payload.
3.	Prefer structured fields (Transform2D, Style2D, Glyph2D) over many loose scalar fields.
That keeps signatures stable and makes composition clean.
4.	Reuse via “builders” and “operators,” not custom renderers.
New effects add blocks that output RenderTree, not new renderer inputs.

⸻

What the renderer looks like (Canvas) — code, not circles-only

Below is a realistic, minimal-but-complete Canvas renderer that consumes a RenderTree of draw commands.

It supports:
•	instances with per-element transforms + styles
•	glyph kinds: circle, rect, star, path (polyline)
•	grouping and per-group transform / opacity
•	stable “command stream” shape you can later port to Rust/WASM (no closures)

RenderTree / command schema (JS/TS)

export type ColorRGBA = { r: number; g: number; b: number; a: number };

export type BlendMode =
| "normal"
| "add"
| "multiply"
| "screen";

export type Transform2D = {
// 2x3 affine matrix
a: number; b: number;
c: number; d: number;
e: number; f: number;
};

export type Style2D = {
fill?: ColorRGBA;
stroke?: ColorRGBA;
strokeWidth?: number;
opacity?: number;          // multiplies fill/stroke alpha
};

export type Glyph2D =
| { kind: "circle" }                                   // radius comes from scale in transform
| { kind: "rect" }                                     // size comes from scale in transform
| { kind: "star"; points: number; inner: number }      // inner in 0..1
| { kind: "polyline"; closed?: boolean };              // uses points buffer

export type Instances2DCommand = {
kind: "instances2d";

// Per-instance buffers, all same length N.
// For perf, you’ll likely use Float32Array / Uint32Array.
transforms: Float32Array;   // length N*6 (a,b,c,d,e,f)
styleFill: Uint32Array;     // packed RGBA8 per instance (optional)
styleStroke: Uint32Array;   // packed RGBA8 per instance (optional)
strokeWidth: Float32Array;  // optional; if missing, default
opacity: Float32Array;      // optional
glyph: Glyph2D;

// Optional geometry buffer for polyline glyph (points per instance)
// For a visualizer path, you'd typically NOT use instances2d;
// you'd use a dedicated path command (below). Kept here for completeness.
};

export type Path2DCommand = {
kind: "path2d";
points: Float32Array;     // x0,y0,x1,y1... in canvas space
closed?: boolean;
style: Style2D;
};

export type GroupCommand = {
kind: "group";
transform?: Transform2D;
opacity?: number;
blend?: BlendMode;
children: RenderCmd[];
};

export type ClearCommand = {
kind: "clear";
color: ColorRGBA;
};

export type RenderCmd =
| ClearCommand
| GroupCommand
| Instances2DCommand
| Path2DCommand;

export type RenderTree = { cmds: RenderCmd[] };

Canvas renderer implementation

function setBlendMode(ctx: CanvasRenderingContext2D, mode: BlendMode | undefined) {
switch (mode) {
case "add": ctx.globalCompositeOperation = "lighter"; return;
case "multiply": ctx.globalCompositeOperation = "multiply"; return;
case "screen": ctx.globalCompositeOperation = "screen"; return;
case "normal":
default: ctx.globalCompositeOperation = "source-over"; return;
}
}

function unpackRGBA8(u: number): ColorRGBA {
// u = 0xRRGGBBAA
const r = (u >>> 24) & 0xff;
const g = (u >>> 16) & 0xff;
const b = (u >>>  8) & 0xff;
const a = (u >>>  0) & 0xff;
return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
}

function rgbaToCss(c: ColorRGBA): string {
// Canvas wants CSS color strings; do it once per style when possible.
const r = Math.round(c.r * 255);
const g = Math.round(c.g * 255);
const b = Math.round(c.b * 255);
return `rgba(${r},${g},${b},${c.a})`;
}

function applyTransform(ctx: CanvasRenderingContext2D, m: Transform2D) {
ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
}

function withSavedState(ctx: CanvasRenderingContext2D, fn: () => void) {
ctx.save();
try { fn(); } finally { ctx.restore(); }
}

export class Canvas2DRenderer {
constructor(private ctx: CanvasRenderingContext2D) {}

render(tree: RenderTree) {
const ctx = this.ctx;
// You may choose to always reset transform each frame.
ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.globalAlpha = 1;
ctx.globalCompositeOperation = "source-over";

    for (const cmd of tree.cmds) {
      this.exec(cmd);
    }
}

private exec(cmd: RenderCmd) {
const ctx = this.ctx;

    switch (cmd.kind) {
      case "clear": {
        const css = rgbaToCss(cmd.color);
        withSavedState(ctx, () => {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        });
        return;
      }

      case "group": {
        withSavedState(ctx, () => {
          if (cmd.blend) setBlendMode(ctx, cmd.blend);
          if (cmd.opacity !== undefined) ctx.globalAlpha *= cmd.opacity;
          if (cmd.transform) applyTransform(ctx, cmd.transform);
          for (const child of cmd.children) this.exec(child);
        });
        return;
      }

      case "path2d": {
        withSavedState(ctx, () => {
          const { points, closed, style } = cmd;

          ctx.beginPath();
          if (points.length >= 2) {
            ctx.moveTo(points[0], points[1]);
            for (let i = 2; i < points.length; i += 2) {
              ctx.lineTo(points[i], points[i + 1]);
            }
            if (closed) ctx.closePath();
          }

          const opacity = style.opacity ?? 1;

          if (style.fill) {
            const fill = { ...style.fill, a: style.fill.a * opacity };
            ctx.fillStyle = rgbaToCss(fill);
            ctx.fill();
          }

          if (style.stroke) {
            const stroke = { ...style.stroke, a: style.stroke.a * opacity };
            ctx.strokeStyle = rgbaToCss(stroke);
            ctx.lineWidth = style.strokeWidth ?? 1;
            ctx.stroke();
          }
        });
        return;
      }

      case "instances2d": {
        this.execInstances2D(cmd);
        return;
      }

      default: {
        const _exhaustive: never = cmd;
        return;
      }
    }
}

private execInstances2D(cmd: Instances2DCommand) {
const ctx = this.ctx;

    const N = Math.floor(cmd.transforms.length / 6);
    const hasFill = cmd.styleFill && cmd.styleFill.length === N;
    const hasStroke = cmd.styleStroke && cmd.styleStroke.length === N;
    const hasStrokeWidth = cmd.strokeWidth && cmd.strokeWidth.length === N;
    const hasOpacity = cmd.opacity && cmd.opacity.length === N;

    // NOTE: This is correctness-first. For perf:
    // - batch by style buckets (same fill/stroke) to reduce state changes
    // - precompute Path2D shapes for star, unit circle, unit rect
    // - avoid per-instance save/restore if possible
    for (let i = 0; i < N; i++) {
      const a = cmd.transforms[i * 6 + 0];
      const b = cmd.transforms[i * 6 + 1];
      const c = cmd.transforms[i * 6 + 2];
      const d = cmd.transforms[i * 6 + 3];
      const e = cmd.transforms[i * 6 + 4];
      const f = cmd.transforms[i * 6 + 5];

      const opacity = hasOpacity ? cmd.opacity[i] : 1;

      withSavedState(ctx, () => {
        ctx.transform(a, b, c, d, e, f);
        ctx.globalAlpha *= opacity;

        // Apply per-instance style
        // By convention: glyph is unit-sized at origin, transform scales/translates it.
        let fillCss: string | null = null;
        let strokeCss: string | null = null;

        if (hasFill) {
          const fill = unpackRGBA8(cmd.styleFill[i]);
          fillCss = rgbaToCss(fill);
          ctx.fillStyle = fillCss;
        }
        if (hasStroke) {
          const stroke = unpackRGBA8(cmd.styleStroke[i]);
          strokeCss = rgbaToCss(stroke);
          ctx.strokeStyle = strokeCss;
          ctx.lineWidth = hasStrokeWidth ? cmd.strokeWidth[i] : 1;
        }

        // Draw glyph
        switch (cmd.glyph.kind) {
          case "circle": {
            ctx.beginPath();
            ctx.arc(0, 0, 0.5, 0, Math.PI * 2); // unit circle radius 0.5
            if (fillCss) ctx.fill();
            if (strokeCss) ctx.stroke();
            return;
          }

          case "rect": {
            // unit square centered at origin
            const x = -0.5, y = -0.5, w = 1, h = 1;
            if (fillCss) ctx.fillRect(x, y, w, h);
            if (strokeCss) ctx.strokeRect(x, y, w, h);
            return;
          }

          case "star": {
            const points = Math.max(3, cmd.glyph.points | 0);
            const inner = Math.max(0.05, Math.min(0.95, cmd.glyph.inner));
            ctx.beginPath();
            for (let k = 0; k < points * 2; k++) {
              const isOuter = (k % 2) === 0;
              const r = isOuter ? 0.5 : 0.5 * inner;
              const theta = (k / (points * 2)) * Math.PI * 2 - Math.PI / 2;
              const x = Math.cos(theta) * r;
              const y = Math.sin(theta) * r;
              if (k === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.closePath();
            if (fillCss) ctx.fill();
            if (strokeCss) ctx.stroke();
            return;
          }

          case "polyline": {
            // Not common for instancing; prefer Path2DCommand for one path.
            // Here, you'd need per-instance point buffers to draw; omitted.
            return;
          }
        }
      });
    }
}
}

How this renderer supports all your examples
•	Particles swirling: Instances2D(glyph=circle)
•	Letters forming: still Instances2D, just change transforms for half the domain
•	Morphing paths: Path2DCommand(points=...) (or multiple paths grouped)
•	2D mapping: user IO produces Field<vec2> → transforms feed Instances2D
•	Mixed shapes: glyph: Field<Glyph2D> (if you want per-element glyph) or split into groups
•	Static color swirl: same as particles, but transforms don’t move

⸻

What you likely need next (implementation reality)

To make the above renderer usable from your current “closure compiler” without IR yet, you just need your existing blocks to compile to a Program<RenderTree> where RenderTree.cmds are filled each frame. That’s totally compatible with your current runtime.

If you want, tell me what your current RenderTree type is today (or paste it), and I’ll map this schema onto it with minimal churn.