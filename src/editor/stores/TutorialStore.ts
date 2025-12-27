/**
 * @file TutorialStore - Interactive tutorial system
 *
 * Manages tutorial state, tracks user progress through steps,
 * and responds to editor events to detect completion criteria.
 */

import { makeObservable, observable, action, computed } from 'mobx';
import type { RootStore } from './RootStore';
import type { WireAddedEvent, BindingAddedEvent } from '../events/types';

// =============================================================================
// Types
// =============================================================================

/**
 * Completion criteria for a tutorial step.
 * When the user performs the matching action, the step is complete.
 */
export type StepCriteria =
  | { type: 'wire'; fromBlock: string; fromSlot: string; toBlock: string; toSlot: string }
  | { type: 'busListener'; busName: string; toBlock: string; toSlot: string }
  | { type: 'busPublisher'; busName: string; fromBlock: string; fromSlot: string }
  | { type: 'manual' }; // User clicks "Next" button

/**
 * A single tutorial step.
 */
export interface TutorialStep {
  /** Unique step ID */
  id: string;
  /** Short title for the step */
  title: string;
  /** Detailed instructions (supports markdown-like formatting) */
  instructions: string;
  /** What the user needs to do to complete this step */
  criteria: StepCriteria;
  /** Optional hint shown after a delay */
  hint?: string;
  /** Highlight these block labels in the UI */
  highlightBlocks?: string[];
  /** Celebration message shown on completion */
  celebration?: string;
}

// =============================================================================
// Tutorial Step Definitions
// =============================================================================

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Oscilla!',
    instructions: `
You've loaded the Tutorial macro with 13 blocks. Right now the canvas is blank because the Render block has no data.

Let's fix that by connecting the **Grid Domain** to the **Render** block.

**Your task:** Connect **⑧ Grid Domain**'s **domain** output → **⑬ Render**'s **domain** input

_Drag from the output port (right side) to the input port (left side)._
    `.trim(),
    criteria: { type: 'wire', fromBlock: '⑧ Grid Domain', fromSlot: 'domain', toBlock: '⑬ Render', toSlot: 'domain' },
    highlightBlocks: ['⑧ Grid Domain', '⑬ Render'],
    hint: 'Look for the small circles on the sides of each block. Outputs are on the right, inputs on the left.',
    celebration: 'Great! The Render block now knows what elements exist.',
  },
  {
    id: 'positions',
    title: 'Add Positions',
    instructions: `
The Render block knows *what* to draw (the domain), but not *where*.

**Your task:** Connect **⑧ Grid Domain**'s **pos0** output → **⑬ Render**'s **positions** input

This tells Render where to place each dot.
    `.trim(),
    criteria: { type: 'wire', fromBlock: '⑧ Grid Domain', fromSlot: 'pos0', toBlock: '⑬ Render', toSlot: 'positions' },
    highlightBlocks: ['⑧ Grid Domain', '⑬ Render'],
    celebration: '🎉 You should see dots on the canvas now!',
  },
  {
    id: 'oscillator',
    title: 'Animate with the Oscillator',
    instructions: `
The dots are static. Let's make them breathe!

The **② Oscillator** is already receiving timing from the **phaseA** bus. It outputs a smooth wave.

**Your task:** Connect **② Oscillator**'s **out** output → **⑬ Render**'s **radius** input
    `.trim(),
    criteria: { type: 'wire', fromBlock: '② Oscillator', fromSlot: 'out', toBlock: '⑬ Render', toSlot: 'radius' },
    highlightBlocks: ['② Oscillator', '⑬ Render'],
    hint: 'The Oscillator is in the Phase lane at the top.',
    celebration: 'The dots are pulsing! But they disappear when the wave goes negative...',
  },
  {
    id: 'shaper',
    title: 'Smooth with the Shaper',
    instructions: `
The sine wave goes from -1 to 1, which causes dots to disappear.

The **③ Shaper** can fix this by remapping values to a better range.

**Step 1:** Connect **② Oscillator**'s **out** → **③ Shaper**'s **in** input

**Step 2:** Connect **③ Shaper**'s **out** → **⑬ Render**'s **radius** input

_(This replaces the previous direct connection)_
    `.trim(),
    criteria: { type: 'wire', fromBlock: '③ Shaper', fromSlot: 'out', toBlock: '⑬ Render', toSlot: 'radius' },
    highlightBlocks: ['② Oscillator', '③ Shaper', '⑬ Render'],
    celebration: 'Smooth breathing animation! The Shaper remaps values to 0-1.',
  },
  {
    id: 'colorLfo',
    title: 'Add Cycling Colors',
    instructions: `
Now let's add color! The **⑥ Color LFO** generates cycling colors from phase.

But there's a catch: Color LFO outputs a **Signal** (one color), and Render needs a **Field** (color per element).

We need the **⑪ Broadcast Signal** to spread the color to all elements.

**Step 1:** Connect **⑥ Color LFO**'s **color** → **⑪ Broadcast Signal**'s **signal** input
    `.trim(),
    criteria: { type: 'wire', fromBlock: '⑥ Color LFO', fromSlot: 'color', toBlock: '⑪ Broadcast Signal', toSlot: 'signal' },
    highlightBlocks: ['⑥ Color LFO', '⑪ Broadcast Signal'],
    hint: 'Broadcast is in the Fields lane. It converts Signal → Field.',
    celebration: 'Color LFO connected to Broadcast!',
  },
  {
    id: 'broadcastDomain',
    title: 'Complete the Broadcast',
    instructions: `
The Broadcast block needs to know the domain to spread the color across.

**Your task:** Connect **⑧ Grid Domain**'s **domain** → **⑪ Broadcast Signal**'s **domain** input
    `.trim(),
    criteria: { type: 'wire', fromBlock: '⑧ Grid Domain', fromSlot: 'domain', toBlock: '⑪ Broadcast Signal', toSlot: 'domain' },
    highlightBlocks: ['⑧ Grid Domain', '⑪ Broadcast Signal'],
    celebration: 'Broadcast now knows which elements to color!',
  },
  {
    id: 'broadcastToRender',
    title: 'Connect Color to Render',
    instructions: `
Final step for color!

**Your task:** Connect **⑪ Broadcast Signal**'s **out** → **⑬ Render**'s **color** input
    `.trim(),
    criteria: { type: 'wire', fromBlock: '⑪ Broadcast Signal', fromSlot: 'out', toBlock: '⑬ Render', toSlot: 'color' },
    highlightBlocks: ['⑪ Broadcast Signal', '⑬ Render'],
    celebration: '🌈 Beautiful cycling colors!',
  },
  {
    id: 'complete',
    title: 'Tutorial Complete!',
    instructions: `
**Congratulations!** You've learned the fundamentals:

• **Domain** defines what elements exist
• **Fields** carry per-element data (positions, colors)
• **Signals** are time-varying single values
• **Broadcast** converts Signal → Field

**Explore more:**
• Connect **⑨ ID Hash** → **⑩ Colorize** → Render for per-element colors
• The **④ Pulse Divider** and **⑤ Envelope** create rhythmic accents
• Try the other macros to see complete patches!

_Click "Finish Tutorial" to close this panel._
    `.trim(),
    criteria: { type: 'manual' },
    highlightBlocks: [],
  },
];

// =============================================================================
// TutorialStore
// =============================================================================

export class TutorialStore {
  /** Whether the tutorial is currently active */
  isActive = false;

  /** Current step index */
  currentStepIndex = 0;

  /** Block ID to label mapping (set when tutorial macro is loaded) */
  blockIdToLabel = new Map<string, string>();

  /** Label to block ID mapping */
  labelToBlockId = new Map<string, string>();

  private root: RootStore;
  private unsubscribers: Array<() => void> = [];

  constructor(root: RootStore) {
    this.root = root;

    makeObservable(this, {
      isActive: observable,
      currentStepIndex: observable,
      currentStep: computed,
      progress: computed,
      start: action,
      stop: action,
      nextStep: action,
      previousStep: action,
      checkWireAdded: action,
      checkBindingAdded: action,
    });
  }

  /** Get the current tutorial step */
  get currentStep(): TutorialStep | null {
    if (!this.isActive) return null;
    return TUTORIAL_STEPS[this.currentStepIndex] ?? null;
  }

  /** Get progress as a fraction (0-1) */
  get progress(): number {
    return this.currentStepIndex / (TUTORIAL_STEPS.length - 1);
  }

  /** Get all steps */
  get steps(): readonly TutorialStep[] {
    return TUTORIAL_STEPS;
  }

  /**
   * Start the tutorial.
   * Called when the tutorial macro is expanded.
   */
  start(blockIdToLabel: Map<string, string>): void {
    this.isActive = true;
    this.currentStepIndex = 0;
    this.blockIdToLabel = blockIdToLabel;

    // Build reverse mapping
    this.labelToBlockId.clear();
    for (const [id, label] of blockIdToLabel) {
      this.labelToBlockId.set(label, id);
    }

    this.setupEventListeners();
  }

  /**
   * Stop the tutorial and clean up.
   */
  stop(): void {
    this.isActive = false;
    this.currentStepIndex = 0;
    this.blockIdToLabel.clear();
    this.labelToBlockId.clear();
    this.cleanupEventListeners();
  }

  /**
   * Move to the next step.
   */
  nextStep(): void {
    if (this.currentStepIndex < TUTORIAL_STEPS.length - 1) {
      this.currentStepIndex++;
    }
  }

  /**
   * Move to the previous step.
   */
  previousStep(): void {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
    }
  }

  /**
   * Check if a WireAdded event matches the current step's completion criteria.
   */
  checkWireAdded(event: WireAddedEvent): void {
    const step = this.currentStep;
    if (!step) return;

    const criteria = step.criteria;
    if (criteria.type !== 'wire') return;

    const fromLabel = this.blockIdToLabel.get(event.from.blockId);
    const toLabel = this.blockIdToLabel.get(event.to.blockId);

    if (
      fromLabel === criteria.fromBlock &&
      event.from.slotId === criteria.fromSlot &&
      toLabel === criteria.toBlock &&
      event.to.slotId === criteria.toSlot
    ) {
      this.nextStep();
    }
  }

  /**
   * Check if a BindingAdded event matches the current step's completion criteria.
   */
  checkBindingAdded(event: BindingAddedEvent): void {
    const step = this.currentStep;
    if (!step) return;

    const criteria = step.criteria;

    if (criteria.type === 'busListener' && event.direction === 'subscribe') {
      const bus = this.root.busStore.buses.find(b => b.id === event.busId);
      const blockLabel = this.blockIdToLabel.get(event.blockId);

      if (
        bus?.name === criteria.busName &&
        blockLabel === criteria.toBlock &&
        event.port === criteria.toSlot
      ) {
        this.nextStep();
      }
    }

    if (criteria.type === 'busPublisher' && event.direction === 'publish') {
      const bus = this.root.busStore.buses.find(b => b.id === event.busId);
      const blockLabel = this.blockIdToLabel.get(event.blockId);

      if (
        bus?.name === criteria.busName &&
        blockLabel === criteria.fromBlock &&
        event.port === criteria.fromSlot
      ) {
        this.nextStep();
      }
    }
  }

  /**
   * Get block IDs to highlight for the current step.
   */
  getHighlightedBlockIds(): string[] {
    const step = this.currentStep;
    if (!step || !step.highlightBlocks) return [];

    return step.highlightBlocks
      .map(label => this.labelToBlockId.get(label))
      .filter((id): id is string => id !== undefined);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private setupEventListeners(): void {
    this.cleanupEventListeners();

    // Listen for wire connections
    this.unsubscribers.push(
      this.root.events.on('WireAdded', (event) => {
        this.checkWireAdded(event);
      })
    );

    // Listen for bus bindings
    this.unsubscribers.push(
      this.root.events.on('BindingAdded', (event) => {
        this.checkBindingAdded(event);
      })
    );
  }

  private cleanupEventListeners(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }
}
