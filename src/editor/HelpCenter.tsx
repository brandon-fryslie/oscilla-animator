import React, { useMemo, useState } from 'react';

export type HelpCenterTopicId =
  | 'overview'
  | 'overview.concepts'
  | 'overview.motivation'
  | 'overview.inspiration'
  | 'overview.roadmap'
  | 'blocks'
  | 'blocks.macros'
  | 'blocks.composites'
  | 'blocks.primitives'
  | 'ports'
  | 'ports.fields'
  | 'ports.signals'
  | 'ports.programs'
  | 'library'
  | 'inspector'
  | 'preview'
  | 'controlSurface'
  | 'patch';

export interface HelpCenterProps {
  isOpen: boolean;
  initialTopicId?: HelpCenterTopicId;
  onClose: () => void;
  onRetakeTour: () => void;
}

interface HelpNode {
  id: HelpCenterTopicId;
  label: string;
  parentId?: HelpCenterTopicId;
  children?: HelpNode[];
  render: () => React.ReactNode;
}

function OverviewPage({ onRetakeTour }: { onRetakeTour: () => void }) {
  return (
    <div className="help-center-page">
      <h2>Overview</h2>
      <p>
        The Loom Editor is a node-based environment for designing procedural SVG animations. Instead of placing keyframes on
        a linear timeline, you build a <strong>graph of blocks</strong> that describe what exists, how it varies per element,
        and how it changes over time.
      </p>
      <p>
        Animations are expressed as <strong>programs</strong> – pure functions of time that produce a declarative render tree.
        Fields, signals, and phase machines let you work at the level of <em>rules</em> and <em>structure</em>, rather than
        per-frame edits.
      </p>
      <p>
        The editor is split into a few key areas:
      </p>
      <ul>
        <li>
          The <strong>Library</strong> (left) holds blocks: Sources, Fields, Time, Compose, Render, FX, and Macros.
        </li>
        <li>
          The <strong>Patch</strong> (center) is where those blocks are wired into lanes that represent different value domains.
        </li>
        <li>
          The <strong>Preview</strong> and <strong>Control Surface</strong> (right) let you see and play with the running program.
        </li>
      </ul>
      <p>
        Under the hood, the patch is compiled to a strongly-typed kernel (V4) that knows about Scenes, per-element Fields,
        phase machines, compositors, and render trees.
      </p>
      <div className="help-center-callout">
        <h3>Want the guided tour again?</h3>
        <p>You can rerun the interactive tour at any time to reacquaint yourself with the main areas.</p>
        <button className="help-center-retake-btn" onClick={onRetakeTour}>
          Retake the Tour
        </button>
      </div>
    </div>
  );
}

function ConceptsPage() {
  return (
    <div className="help-center-page">
      <h2>Concepts</h2>
      <p>
        The Loom Editor is built around a few core ideas that show up throughout the app and codebase. Understanding these
        makes it much easier to reason about patches.
      </p>
      <h3>Scenes and Targets</h3>
      <p>
        A <strong>Scene</strong> is the static geometry you want to animate. Today that&apos;s primarily SVG paths (logo shapes,
        text outlines, abstract lines).
      </p>
      <p>
        From a Scene, you sample <strong>Targets</strong> – points along the paths. Each target becomes an independent element
        (a particle, a stroke segment, a glyph) that can be animated separately.
      </p>
      <h3>Fields</h3>
      <p>
        A <strong>Field</strong> is a value that varies per element. Instead of saying "all particles start at x = 200", you
        say "each particle has its own start position inside this region, or at some radial distance, with jitter".
      </p>
      <p>
        In the kernel, a Field is a function:
      </p>
      <pre className="help-center-code">
        <code>Field&lt;T&gt; = (seed, n, ctx) =&gt; readonly T[];</code>
      </pre>
      <p>
        Fields are evaluated in bulk at compile time, producing arrays of per-element values: positions, delays, durations,
        sizes, opacities, colors, and more.
      </p>
      <h3>Signals</h3>
      <p>
        A <strong>Signal</strong> is a value that changes over time. While Fields give you variation across elements, Signals
        give you variation across time: global progress, oscillators, phase machines, etc.
      </p>
      <p>
        Signals feed into blocks that derive motion, easing, and other time-based behavior.
      </p>
      <h3>Phase Machines</h3>
      <p>
        A <strong>Phase Machine</strong> structures an animation into phases such as entrance, hold, and exit. It produces a
        <code>PhaseSample</code> with:
      </p>
      <ul>
        <li>the current phase name,</li>
        <li>a normalized progress <code>u</code> within that phase,</li>
        <li>raw time <code>tLocal</code> since the phase started.</li>
      </ul>
      <p>
        This lets you write animation logic that thinks in terms of "where in the entrance are we?" rather than "what is the
        absolute time in milliseconds?".
      </p>
      <h3>Programs and Render Trees</h3>
      <p>
        A <strong>Program</strong> is the compiled result of your patch: a function of time and runtime context that returns
        a <strong>RenderTree</strong>.
      </p>
      <p>
        The RenderTree is a nested structure of groups, shapes, and effects that maps neatly onto SVG. Time topology comes from
        the TimeRoot, which produces a TimeModel for the UI and runtime.
      </p>
    </div>
  );
}

function MotivationPage() {
  return (
    <div className="help-center-page">
      <h2>Motivation</h2>
      <p>
        Traditional animation tools revolve around a timeline and keyframes. That works well for short, bespoke sequences, but
        it breaks down when you want:
      </p>
      <ul>
        <li>many elements (hundreds or thousands) moving together,</li>
        <li>controlled randomness and variation,</li>
        <li>animations that can run indefinitely without obvious loops.</li>
      </ul>
      <p>
        The Loom Editor is designed for these &quot;procedural&quot; scenarios. Instead of micro-managing every element, you
        declare rules and structures:
      </p>
      <ul>
        <li>how to sample geometry into targets,</li>
        <li>how to assign per-element timing and style,</li>
        <li>how to structure time (phases, beats, cycles),</li>
        <li>how to map those ingredients into motion and drawing.</li>
      </ul>
      <p>
        This makes it much easier to create rich logo reveals, particle effects, and ambient surfaces that can be reused,
        parameterized, and exported.
      </p>
    </div>
  );
}

function InspirationPage() {
  return (
    <div className="help-center-page">
      <h2>Inspiration</h2>
      <p>
        The design borrows from several traditions:
      </p>
      <ul>
        <li>
          <strong>Modular synthesizers</strong> and visual patch bays, where cables represent data flow and small modules combine to
          form complex behaviors.
        </li>
        <li>
          <strong>Shader/node editors</strong> in tools like TouchDesigner, Unreal, or Blender, where graphs describe material pipelines
          and post-processing.
        </li>
        <li>
          <strong>Generative art</strong> systems that emphasize randomness, structure, and emergent behavior over fixed timelines.
        </li>
      </ul>
      <p>
        The goal is to bring that spirit to SVG/logo animation, with a focus on readability, type safety, and exportability to
        the web.
      </p>
    </div>
  );
}

function RoadmapPage() {
  return (
    <div className="help-center-page">
      <h2>Roadmap</h2>
      <p>
        The editor is under active development. Some directions the system is moving toward:
      </p>
      <ul>
        <li>
          <strong>Richer ambient loops:</strong> better primitives and presets for multi-scale looping, so animations can run for a
          long time while still "rhyming".
        </li>
        <li>
          <strong>More compositors:</strong> global post-effects that can be layered onto any program without changing the core logic.
        </li>
        <li>
          <strong>Export paths:</strong> smoother pipelines for exporting animations as code, assets, or embeddable components.
        </li>
        <li>
          <strong>Custom blocks:</strong> a clearer path for authoring reusable composite blocks directly from the UI.
        </li>
      </ul>
      <p>
        Not all of these exist yet in the UI, but the internal architecture (compiler, runtime, compositors) is shaped to make them
        possible.
      </p>
    </div>
  );
}

function BlocksOverviewPage() {
  return (
    <div className="help-center-page">
      <h2>Blocks</h2>
      <p>
        Blocks are the atoms of a patch. Each block has typed input and output ports and a small, focused responsibility. You wire
        them together to express scenes, timing, motion, and rendering.
      </p>
      <p>
        Internally, blocks fall into three structural forms:
      </p>
      <ul>
        <li>
          <strong>Macros</strong> – expand into a small graph of blocks when you drop them (great for starting points).
        </li>
        <li>
          <strong>Composites</strong> – reusable subgraphs that appear as a single block in the editor.
        </li>
        <li>
          <strong>Primitives</strong> – leaf nodes implemented directly in TypeScript and compiled into kernel artifacts.
        </li>
      </ul>
      <p>
        Most day-to-day work involves combining primitives and composites. Macros help you quickly spin up illustrative patches
        that you can pick apart and customize.
      </p>
    </div>
  );
}

function BlocksMacrosPage() {
  return (
    <div className="help-center-page">
      <h2>Blocks: Macros</h2>
      <p>
        <strong>Macro</strong> blocks are &quot;recipe starters&quot;. When you drop a macro into a lane, it expands into a prewired
        collection of blocks that implement a particular animation style.
      </p>
      <p>Examples include:</p>
      <ul>
        <li>✨ Line Drawing – reveals paths using animated strokes.</li>
        <li>✨ Particles – particles converge to form a shape.</li>
        <li>✨ Radial Burst, Cascade, Scatter, Implosion, Swarm, Nebula, Glitch Storm, Aurora, Liquid, Reveal Mask.</li>
      </ul>
      <p>
        Each macro sets up a full pipeline: Scene → Fields → Phase → Compose → Render → Output. You can inspect and edit the
        resulting blocks like any other patch.
      </p>
      <p>
        A recommended learning path is to drop a macro, explore the generated blocks and connections, and then gradually swap
        pieces for your own variants.
      </p>
    </div>
  );
}

function BlocksCompositesPage() {
  return (
    <div className="help-center-page">
      <h2>Blocks: Composites</h2>
      <p>
        <strong>Composite</strong> blocks wrap a small internal graph of primitives into a single, reusable unit with its own parameters
        and ports. They help keep complex patches readable.
      </p>
      <p>
        Over time, more behaviors will be expressed as composites, making it easier to:
      </p>
      <ul>
        <li>share higher-level behaviors between patches,</li>
        <li>hide incidental complexity behind a friendly interface,</li>
        <li>encapsulate patterns like &quot;per-element progress&quot; or specific motion styles.</li>
      </ul>
    </div>
  );
}

function BlocksPrimitivesPage() {
  return (
    <div className="help-center-page">
      <h2>Blocks: Primitives</h2>
      <p>
        <strong>Primitive</strong> blocks are the foundational operators. Each primitive directly compiles to a kernel artifact and has a
        clear, narrow responsibility.
      </p>
      <p>Some common primitive families:</p>
      <ul>
        <li>
          <strong>Sources</strong> – load Scenes or sample Targets (e.g., SVGPathSource, SamplePoints, TextSource).
        </li>
        <li>
          <strong>Fields</strong> – generate per-element values (RadialOrigin, RegionField, LinearStagger, SizeVariation, ColorField, etc.).
        </li>
        <li>
          <strong>Time</strong> – shape temporal structure (PhaseMachine, PhaseProgress, EaseRamp).
        </li>
        <li>
          <strong>Compose</strong> – combine ingredients into motion (PerElementTransport, PerElementProgress, LerpPoints).
        </li>
        <li>
          <strong>Render</strong> – draw things (PerElementCircles, PathRenderer, Canvas, filters and effects).
        </li>
      </ul>
      <p>
        Primitives are typed at the port level, which means the compiler can validate that you&apos;re wiring the right kinds of values
        together and provide clear error messages when something doesn&apos;t line up.
      </p>
    </div>
  );
}

function PortsOverviewPage() {
  return (
    <div className="help-center-page">
      <h2>Ports</h2>
      <p>
        Ports are the connection points on blocks. Each port has a <strong>direction</strong> (input or output) and a
        <strong>type</strong> that describes what flows through it.
      </p>
      <p>
        The editor shows port labels on blocks and can optionally display type hints. The compiler uses a stricter type system under
        the hood to keep patches sound.
      </p>
      <p>
        When wiring blocks, you&apos;re essentially deciding how values (Scenes, Fields, Signals, Programs) move from one computation
        to another.
      </p>
    </div>
  );
}

function PortsFieldsPage() {
  return (
    <div className="help-center-page">
      <h2>Ports: Fields</h2>
      <p>
        <strong>Field</strong> ports carry per-element arrays. In the editor UI you&apos;ll see types like <code>Field&lt;Point&gt;</code>,
        <code>Field&lt;Duration&gt;</code>, or <code>Field&lt;number&gt;</code>.
      </p>
      <p>
        At the kernel level, numeric fields share a common representation (<code>Field:number</code>), and point-like fields share
        another (<code>Field:vec2</code>). This lets primitives like PerElementProgress and PerElementTransport work with any field
        that produces the right shape of data.
      </p>
      <p>
        Fields are typically produced by Field blocks (RadialOrigin, RegionField, LinearStagger, etc.) and consumed by:
      </p>
      <ul>
        <li>timing blocks (PerElementProgress, duration variations),</li>
        <li>motion blocks (origins, targets in LerpPoints or PerElementTransport),</li>
        <li>style blocks (size, opacity, color fields).</li>
      </ul>
    </div>
  );
}

function PortsSignalsPage() {
  return (
    <div className="help-center-page">
      <h2>Ports: Signals</h2>
      <p>
        <strong>Signal</strong> ports represent time-varying values. In the UI you&apos;ll see types like <code>Signal&lt;Unit&gt;</code>,
        <code>Signal&lt;Time&gt;</code>, <code>Signal&lt;Point&gt;</code>, or <code>Signal&lt;PhaseSample&gt;</code>.
      </p>
      <p>
        Signals are produced by time-related blocks (PhaseMachine, PhaseProgress, oscillators) and consumed by:
      </p>
      <ul>
        <li>interpolators such as LerpPoints,</li>
        <li>easing adapters like EaseRamp,</li>
        <li>rendering blocks that need a notion of progress or position over time.</li>
      </ul>
      <p>
        Signals and Fields often interact: a per-element Field gives each element a different parameter, while a Signal describes
        how that parameter evolves in time.
      </p>
    </div>
  );
}

function PortsProgramsPage() {
  return (
    <div className="help-center-page">
      <h2>Ports: Programs and Render Trees</h2>
      <p>
        At the end of the patch, you&apos;ll see ports that carry <strong>Program</strong> or <strong>RenderTree</strong> values.
      </p>
      <p>
        A Program is a function of time and runtime context that returns a RenderTree. The compiler expects the final output of
        the patch to be a &quot;RenderTreeProgram&quot; – a Program whose output tree the runtime can render.
      </p>
      <p>
        Sinks like Canvas or other output blocks ultimately consume Programs or RenderTrees. This is where your declarative structure
        becomes pixels.
      </p>
    </div>
  );
}

function LibraryPage() {
  return (
    <div className="help-center-page">
      <h2>Library</h2>
      <p>
        The Library panel on the left is your catalog of available blocks. It&apos;s organized by structural form (macro, composite,
        primitive) and by functional subcategory (Sources, Fields, Time, Compose, Render, FX, Adapters, etc.).
      </p>
      <p>You can filter the Library in a few ways:</p>
      <ul>
        <li>
          <strong>By lane:</strong> show only blocks that are a natural fit for the lane you&apos;re working in.
        </li>
        <li>
          <strong>By connection:</strong> show blocks whose inputs can accept the currently selected output.
        </li>
        <li>
          Or show the full palette to browse everything.
        </li>
      </ul>
      <p>
        Drag blocks from the Library into lanes to add them to your patch. Many macros will drop a whole configuration of blocks
        and wires, while primitives land as a single block that you can wire up yourself.
      </p>
    </div>
  );
}

function InspectorPage() {
  return (
    <div className="help-center-page">
      <h2>Inspector</h2>
      <p>
        The Inspector shows the currently selected block&apos;s details. It&apos;s where you edit labels, parameters, and sometimes
        helpful descriptions.
      </p>
      <p>Typical actions:</p>
      <ul>
        <li>
          <strong>Rename blocks</strong> to keep complex patches readable (e.g., &quot;Entrance Stagger&quot; instead of
          &quot;LinearStagger&quot;).
        </li>
        <li>
          <strong>Adjust parameters</strong> via sliders, number inputs, toggles, color pickers, and dropdowns.
        </li>
        <li>
          Review the block&apos;s <strong>description</strong> to understand what it&apos;s doing in the graph.
        </li>
      </ul>
      <p>
        Because the editor compiles your patch as you tweak values, you can iteratively adjust parameters and immediately see the
        impact in the Preview.
      </p>
    </div>
  );
}

function PreviewPage() {
  return (
    <div className="help-center-page">
      <h2>Preview</h2>
      <p>
        The Preview panel shows the running program as SVG. It&apos;s the main way you see whether your patch does what you
        expect.
      </p>
      <p>Controls include:</p>
      <ul>
        <li>
          <strong>Play / Pause</strong> – start and stop playback.
        </li>
        <li>
          <strong>Scrubber</strong> – scrub through time, including into future phases.
        </li>
        <li>
          <strong>Speed</strong> – multiply the effective time speed (slow down or speed up).
        </li>
        <li>
          <strong>Seed</strong> – change the random seed for Fields, producing new arrangements from the same rules.
        </li>
      </ul>
      <p>
        The Preview reflects the active TimeModel (finite, cyclic, or infinite) and can display structural cue points.
      </p>
    </div>
  );
}

function ControlSurfacePage() {
  return (
    <div className="help-center-page">
      <h2>Control Surface</h2>
      <p>
        The Control Surface collects important parameters from across the patch into a single, compact panel. It&apos;s optimized
        for <strong>live tweaking</strong> and for sharing patches with people who don&apos;t want to think in terms of blocks and
        wires.
      </p>
      <p>
        When you load a macro or a curated patch, the Control Surface is typically populated with:
      </p>
      <ul>
        <li>sliders for key durations and delays,</li>
        <li>toggles for major modes or variants,</li>
        <li>color pickers or palettes,</li>
        <li>range controls for densities and counts.</li>
      </ul>
      <p>
        You can use the Control Surface to explore the design space of a patch without diving into each block. When something
        interesting emerges, you can still go into the Patch and Inspector to see which blocks changed and why.
      </p>
    </div>
  );
}

function PatchPage() {
  return (
    <div className="help-center-page">
      <h2>Patch Bay</h2>
      <p>
        The Patch Bay is where you connect blocks into a graph. Lanes organize blocks by role: Scene, Phase, Fields, Spec, Program, Output.
      </p>
      <p>
        Drag blocks from the Library into lanes, then wire outputs to inputs. Wires flow left-to-right, showing how data moves through
        your animation pipeline.
      </p>
      <ul>
        <li><strong>Scene lane:</strong> Where your source geometry lives (SVG paths, text, shapes).</li>
        <li><strong>Fields lane:</strong> Per-element values (positions, delays, durations, colors).</li>
        <li><strong>Phase lane:</strong> Time structure (entrance, hold, exit phases).</li>
        <li><strong>Spec lane:</strong> Animation specifications combining fields and timing.</li>
        <li><strong>Program lane:</strong> The compiled animation program.</li>
        <li><strong>Output lane:</strong> Rendering and output blocks.</li>
      </ul>
      <p>
        Use lane descriptions and type hints to keep structure clear. The compiler validates that you&apos;re wiring compatible types together.
      </p>
    </div>
  );
}

function buildTopics(onRetakeTour: () => void): HelpNode[] {
  return [
    {
      id: 'overview',
      label: 'Overview',
      render: () => <OverviewPage onRetakeTour={onRetakeTour} />,
      children: [
        { id: 'overview.concepts', label: 'Concepts', parentId: 'overview', render: () => <ConceptsPage /> },
        { id: 'overview.motivation', label: 'Motivation', parentId: 'overview', render: () => <MotivationPage /> },
        { id: 'overview.inspiration', label: 'Inspiration', parentId: 'overview', render: () => <InspirationPage /> },
        { id: 'overview.roadmap', label: 'Roadmap', parentId: 'overview', render: () => <RoadmapPage /> },
      ],
    },
    {
      id: 'blocks',
      label: 'Blocks',
      render: () => <BlocksOverviewPage />,
      children: [
        { id: 'blocks.macros', label: 'Macros', parentId: 'blocks', render: () => <BlocksMacrosPage /> },
        { id: 'blocks.composites', label: 'Composites', parentId: 'blocks', render: () => <BlocksCompositesPage /> },
        { id: 'blocks.primitives', label: 'Primitives', parentId: 'blocks', render: () => <BlocksPrimitivesPage /> },
      ],
    },
    {
      id: 'ports',
      label: 'Ports',
      render: () => <PortsOverviewPage />,
      children: [
        { id: 'ports.fields', label: 'Fields', parentId: 'ports', render: () => <PortsFieldsPage /> },
        { id: 'ports.signals', label: 'Signals', parentId: 'ports', render: () => <PortsSignalsPage /> },
        { id: 'ports.programs', label: 'Programs & Trees', parentId: 'ports', render: () => <PortsProgramsPage /> },
      ],
    },
    {
      id: 'library',
      label: 'Library',
      render: () => <LibraryPage />,
    },
    {
      id: 'inspector',
      label: 'Inspector',
      render: () => <InspectorPage />,
    },
    {
      id: 'preview',
      label: 'Preview',
      render: () => <PreviewPage />,
    },
    {
      id: 'controlSurface',
      label: 'Control Surface',
      render: () => <ControlSurfacePage />,
    },
    {
      id: 'patch',
      label: 'Patch Bay',
      render: () => <PatchPage />,
    },
  ];
}

/**
 * Embedded help panel for sidebar - collapsible, shows single topic.
 */
export interface HelpPanelProps {
  topicId: HelpCenterTopicId;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate: (topicId: HelpCenterTopicId) => void;
  onRetakeTour: () => void;
  onPopOut: () => void; // Open in larger modal
}

export const HelpPanel = ({ topicId, collapsed, onToggleCollapse, onNavigate, onRetakeTour, onPopOut }: HelpPanelProps): React.ReactElement => {
  const topics = useMemo(() => buildTopics(onRetakeTour), [onRetakeTour]);

  // Build flat map of all topics
  const flatMap = useMemo(() => {
    const map = new Map<HelpCenterTopicId, HelpNode>();
    topics.forEach((node) => {
      map.set(node.id, node);
      node.children?.forEach((child) => map.set(child.id, child));
    });
    return map;
  }, [topics]);

  const activeNode = flatMap.get(topicId) ?? flatMap.get('overview')!;

  // Get parent breadcrumb if this is a child topic
  const parentNode = activeNode.parentId ? flatMap.get(activeNode.parentId) : null;

  return (
    <div className={`help-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="panel-header help-panel-header" onClick={onToggleCollapse}>
        <span className="panel-title">Help</span>
        <div className="panel-header-actions">
          <button
            className="panel-collapse-icon"
            onClick={(e) => {
              e.stopPropagation();
              onPopOut();
            }}
            title="Open in larger window"
          >
            ⤢
          </button>
          <button
            className="panel-collapse-icon"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            title={collapsed ? 'Show help' : 'Hide help'}
          >
            {collapsed ? '▾' : '▴'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="help-panel-body">
          {/* Topic selector */}
          <div className="help-panel-nav">
            {parentNode && (
              <button
                className="help-panel-breadcrumb"
                onClick={() => onNavigate(parentNode.id)}
              >
                ← {parentNode.label}
              </button>
            )}
            <select
              className="help-panel-select"
              value={topicId}
              onChange={(e) => onNavigate(e.target.value as HelpCenterTopicId)}
            >
              {topics.map((node) => (
                <React.Fragment key={node.id}>
                  <option value={node.id}>{node.label}</option>
                  {node.children?.map((child) => (
                    <option key={child.id} value={child.id}>
                      &nbsp;&nbsp;{child.label}
                    </option>
                  ))}
                </React.Fragment>
              ))}
            </select>
          </div>
          {/* Topic content */}
          <div className="help-panel-content">
            {activeNode.render()}
          </div>
        </div>
      )}
    </div>
  );
};

export function HelpCenterModal({ isOpen, initialTopicId = 'overview', onClose, onRetakeTour }: HelpCenterProps): React.ReactElement | null {
  const topics = useMemo(() => buildTopics(onRetakeTour), [onRetakeTour]);
  const [activeId, setActiveId] = useState<HelpCenterTopicId>(initialTopicId);

  if (!isOpen) return null;

  const flatMap = new Map<HelpCenterTopicId, HelpNode>();
  topics.forEach((node) => {
    flatMap.set(node.id, node);
    node.children?.forEach((child) => flatMap.set(child.id, child));
  });

  const activeNode = flatMap.get(activeId) ?? flatMap.get('overview')!;

  return (
    <div className="help-center-overlay" onClick={onClose}>
      <div
        className="help-center-modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="help-center-header">
          <span className="help-center-title">Loom Editor Help</span>
          <button className="help-center-close" onClick={onClose} aria-label="Close help">
            ×
          </button>
        </div>

        <div className="help-center-body">
          <nav className="help-center-sidebar">
            {topics.map((node) => (
              <div key={node.id} className="help-center-section">
                <button
                  className={`help-center-nav-item top-level ${activeNode.id === node.id ? 'active' : ''}`}
                  onClick={() => setActiveId(node.id)}
                >
                  {node.label}
                </button>
                {node.children && (
                  <div className="help-center-sublist">
                    {node.children.map((child) => (
                      <button
                        key={child.id}
                        className={`help-center-nav-item sub-level ${activeNode.id === child.id ? 'active' : ''}`}
                        onClick={() => setActiveId(child.id)}
                      >
                        {child.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <main className="help-center-content">
            {activeNode.render()}
          </main>
        </div>
      </div>
    </div>
  );
}
