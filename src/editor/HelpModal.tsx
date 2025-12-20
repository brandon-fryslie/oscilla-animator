import { useState, useEffect } from 'react';

export type HelpTopic = 'intro' | 'library' | 'inspector' | 'preview' | 'patch' | 'controlSurface';

interface HelpModalProps {
  topic: HelpTopic;
  onClose: () => void;
}

export function HelpModal({ topic, onClose }: HelpModalProps) {
  const steps: { title: string; body: React.ReactNode }[] =
    topic === 'intro'
      ? [
          {
            title: 'Welcome to the Loom Editor',
            body: (
              <>
                <p>
                  This editor is a visual playground for procedural SVG animations. Instead of keyframes on a timeline,
                  you connect blocks that describe <strong>where</strong> elements come from, <strong>how</strong> they move,
                  and <strong>how</strong> they look.
                </p>
                <p>
                  You are always looking at a live program: change a block, and the preview updates within a moment.
                </p>
              </>
            ),
          },
          {
            title: 'Library: your block palette',
            body: (
              <ul>
                <li>On the left, the Library holds Sources, Fields, Time, Compose, Render, and ✨ Macros.</li>
                <li>Drag blocks into lanes in the Patch to start building an animation.</li>
                <li>Start with a macro, then tweak or replace its pieces as you learn.</li>
              </ul>
            ),
          },
          {
            title: 'Patch: the animation graph',
            body: (
              <ul>
                <li>The center lanes show how data flows: Scene → Phase → Fields → Spec → Program.</li>
                <li>Connect outputs to inputs to move scenes, fields, and signals through the graph.</li>
                <li>Think of it as a visual program where wires show the "why" behind the motion.</li>
              </ul>
            ),
          },
          {
            title: 'Preview & Control Surface',
            body: (
              <ul>
                <li>The right side shows the live animation and key controls.</li>
                <li>Use Play, Scrub, Seed, and Speed to explore time and variation.</li>
                <li>The Control Surface groups important knobs so you can play without diving into every block.</li>
              </ul>
            ),
          },
          {
            title: 'Try this right now',
            body: (
              <ul>
                <li>Open the <strong>Demos</strong> menu (top center) and load <em>Full Pipeline</em> or <em>Particles</em>.</li>
                <li>Watch how blocks land in lanes, then tweak parameters in the Inspector.</li>
                <li>Change the <strong>seed</strong> and <strong>speed</strong> in the Preview to explore variations.</li>
              </ul>
            ),
          },
        ]
      : topic === 'library'
        ? [
            {
              title: 'Library: building blocks',
              body: (
                <>
                  <p>
                    The Library is your palette of building blocks. Each block does one thing well: load a Scene, generate per-element Fields,
                    define timing, compose motion, or render output.
                  </p>
                  <ul>
                    <li>Drag blocks from the Library into lanes in the Patch.</li>
                    <li>Use the lane filter and categories to find Sources, Fields, Time, Compose, Render, and Macros.</li>
                    <li>Try dropping a ✨ macro first, then tweak or replace its pieces.</li>
                  </ul>
                </>
              ),
            },
          ]
        : topic === 'inspector'
          ? [
              {
                title: 'Inspector: tune every block',
                body: (
                  <>
                    <p>
                      The Inspector shows the details for the selected block: its label, description, and parameters. This is where you fine-tune
                      numbers, toggles, colors, and dropdowns.
                    </p>
                    <ul>
                      <li>Click a block in the Patch to inspect it.</li>
                      <li>Adjust parameters and watch the Preview update.</li>
                      <li>Rename blocks to keep complex patches readable.</li>
                    </ul>
                  </>
                ),
              },
            ]
          : topic === 'preview'
            ? [
                {
                  title: 'Preview: see time come alive',
                  body: (
                    <>
                      <p>
                        The Preview runs your compiled program. It&apos;s the live result of your patch, updated as you edit.
                      </p>
                      <ul>
                        <li>Use play / pause and the scrubber to explore time.</li>
                        <li>Change <strong>seed</strong> to get new random variations of the same rules.</li>
                        <li>Watch the ⏱ / ∞ indicator to see whether your program is finite or ambient.</li>
                      </ul>
                    </>
                  ),
                },
              ]
            : topic === 'patch'
              ? [
                  {
                    title: 'Patch: the graph of your animation',
                    body: (
                      <>
                        <p>
                          The Patch is where you connect blocks into a graph. Lanes organize blocks by role: Scene, Phase, Fields, Spec, Program, Output.
                        </p>
                        <ul>
                          <li>Drag from the Library into lanes; wires flow left-to-right.</li>
                          <li>Connect outputs to inputs to move data between blocks.</li>
                          <li>Use lane descriptions and type hints to keep structure clear.</li>
                        </ul>
                      </>
                    ),
                  },
                ]
              : [
                  {
                    title: 'Control Surface: macro-level controls',
                    body: (
                      <>
                        <p>
                          The Control Surface groups important parameters from multiple blocks into a single panel. It&apos;s designed for live tweaking
                          and sharing patches with less technical users.
                        </p>
                        <ul>
                          <li>When you load a macro, its key controls appear here as knobs, sliders, and toggles.</li>
                          <li>Use it to explore a patch without diving into every individual block.</li>
                          <li>You can still refine details via the Inspector when you need to.</li>
                        </ul>
                      </>
                    ),
                  },
                ];

  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const pointers:
    | { id: 'library' | 'inspector' | 'preview' | 'patch' | 'control'; label: string }[]
    = (() => {
      if (topic === 'intro') {
        if (stepIndex === 1) {
          return [{ id: 'library', label: 'Library' }];
        }
        if (stepIndex === 2) {
          return [{ id: 'patch', label: 'Patch' }];
        }
        if (stepIndex === 3) {
          return [
            { id: 'preview', label: 'Preview' },
            { id: 'control', label: 'Control Surface' },
          ];
        }
        if (stepIndex === 4) {
          return [
            { id: 'patch', label: 'Follow the wiring here' },
            { id: 'preview', label: 'Watch changes here' },
          ];
        }
        return [];
      }
      if (topic === 'library') return [{ id: 'library', label: 'Library' }];
      if (topic === 'inspector') return [{ id: 'inspector', label: 'Inspector' }];
      if (topic === 'preview') return [{ id: 'preview', label: 'Preview' }];
      if (topic === 'patch') return [{ id: 'patch', label: 'Patch' }];
      if (topic === 'controlSurface') return [{ id: 'control', label: 'Control Surface' }];
      return [];
    })();

  const [pointerStyles, setPointerStyles] = useState<Record<string, React.CSSProperties>>({});

  useEffect(() => {
    if (pointers.length === 0) {
      setPointerStyles({});
      return;
    }

    const nextStyles: Record<string, React.CSSProperties> = {};
    const selectorMap: Record<string, string> = {
      library: '.library-panel',
      inspector: '.inspector-panel',
      preview: '.editor-preview',
      patch: '.editor-patch',
      control: '.editor-control-surface',
    };

    pointers.forEach((ptr) => {
      const selector = selectorMap[ptr.id];
      if (!selector || typeof document === 'undefined') return;
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const top = Math.max(8, rect.top + window.scrollY - 28);
      const left = rect.left + window.scrollX + rect.width / 2;

      nextStyles[ptr.id] = {
        top,
        left,
        transform: 'translateX(-50%)',
      };
    });

    setPointerStyles(nextStyles);
  }, [topic, stepIndex, pointers.length]);

  return (
    <div className="editor-help-overlay" onClick={onClose}>
      {pointers.map((ptr) => (
        <div
          key={ptr.id}
          className={`editor-help-pointer ${ptr.id}`}
          style={pointerStyles[ptr.id]}
        >
          {ptr.label}
        </div>
      ))}
      <div
        className="editor-help-modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="editor-help-header">
          <span className="editor-help-title">{step.title}</span>
          <button className="editor-help-close" onClick={onClose} aria-label="Close help">
            ×
          </button>
        </div>
        <div className="editor-help-body">
          {step.body}
        </div>
        <div className="editor-help-footer">
          <div className="editor-help-steps">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`editor-help-dot ${i === stepIndex ? 'active' : ''}`}
              />
            ))}
          </div>
          <div className="editor-help-buttons">
            {!isFirst && (
              <button
                className="editor-help-btn secondary"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              >
                Back
              </button>
            )}
            {!isLast && (
              <button
                className="editor-help-btn primary"
                onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
              >
                Next
              </button>
            )}
            {isLast && (
              <button className="editor-help-btn primary" onClick={onClose}>
                Got it, let&apos;s animate
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
