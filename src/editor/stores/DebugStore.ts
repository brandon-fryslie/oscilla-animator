/**
 * Debug Store
 *
 * Central store for runtime debugging and inspection.
 *
 * Responsibilities:
 * - Probe management (blocks, buses, bindings)
 * - Console output (REPL interface)
 * - Command execution
 *
 * Aligned with design-docs/11-Debugger
 */

import { makeAutoObservable } from 'mobx';
import {
  type Probe,
  type ProbeTarget,
  type Sample,
  type ValueSummary,
  type DebugLevel,
  type DebugOverview,
  createProbeId,
  formatValueSummary,
  getNumericValue,
} from '../debug/types';
import type { CompiledProgramIR } from '../compiler/ir';

// =============================================================================
// Store Shape Types (for accessing root store)
// =============================================================================

interface StoreBlock {
  id: string;
  type: string;
  label: string;
  category: string;
  params: Record<string, unknown>;
  inputs?: Array<{ id: string; typeDesc?: { type: string } }>;
  outputs?: Array<{ id: string; typeDesc?: { type: string } }>;
}

interface StoreConnection {
  id: string;
  fromBlock: string;
  fromSlot: string;
  toBlock: string;
  toSlot: string;
}

interface StoreBus {
  id: string;
  name: string;
  typeDesc?: { type: string };
}

interface StoreBinding {
  blockId: string;
  busId: string;
  slotId: string;
}

interface RootStore {
  patchStore?: {
    blocks?: StoreBlock[];
    connections?: StoreConnection[];
    patchRevision?: number;
    incrementRevision?: () => void;
  };
  busStore?: {
    buses?: StoreBus[];
    publishers?: StoreBinding[];
    listeners?: StoreBinding[];
  };
  uiStore?: {
    uiState?: {
      selectedBlockId?: string;
      isPlaying?: boolean;
    };
    settings?: {
      seed?: number;
      speed?: number;
    };
  };
  viewStore?: unknown;
}

// =============================================================================
// Console Types
// =============================================================================

export interface ConsoleLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'info';
  content: string;
  timestamp: number;
}

// =============================================================================
// Constants
// =============================================================================

const HISTORY_CAPACITY = 60; // ~10 seconds at 6 samples/sec
const CONSOLE_MAX_LINES = 500;
const GRID_COLUMNS = 4;
const GRID_ITEM_WIDTH = 200;
const GRID_ITEM_HEIGHT = 80;
const GRID_PADDING = 20;

// =============================================================================
// DebugStore
// =============================================================================

export class DebugStore {
  // Probe state
  probes: Map<string, Probe> = new Map();
  debugLevel: DebugLevel = 'basic';

  // Console state
  consoleLines: ConsoleLine[] = [];
  commandHistory: string[] = [];
  historyIndex: number = -1;
  private nextLineId = 1;

  constructor() {
    makeAutoObservable(this);
  }

  // ===========================================================================
  // Probe Management
  // ===========================================================================

  /**
   * Start probing a target.
   */
  addProbe(target: ProbeTarget, label: string, artifactKind: string, blockType?: string): Probe {
    const id = createProbeId(target);

    // If already exists, just activate it
    const existing = this.probes.get(id);
    if (existing) {
      existing.active = true;
      return existing;
    }

    // Calculate position
    const position = this.getAutoPosition(this.probes.size);

    const probe: Probe = {
      id,
      target,
      label,
      artifactKind,
      blockType,
      currentSample: undefined,
      history: [],
      historyCapacity: HISTORY_CAPACITY,
      active: true,
      position,
    };

    this.probes.set(id, probe);
    this.log('info', `Started probing: ${label}`);
    this.triggerRecompile();

    return probe;
  }

  /**
   * Stop probing a target.
   */
  removeProbe(id: string): void {
    const probe = this.probes.get(id);
    if (probe) {
      this.probes.delete(id);
      this.log('info', `Stopped probing: ${probe.label}`);
      this.triggerRecompile();
    }
  }

  /**
   * Toggle probe for a block.
   */
  toggleBlockProbe(blockId: string): void {
    const id = createProbeId({ kind: 'block', blockId });
    if (this.probes.has(id)) {
      this.removeProbe(id);
    } else {
      // Look up block info and add probe
      const block = this.findBlock(blockId);
      if (block) {
        this.addProbe(
          { kind: 'block', blockId },
          block.label || block.type,
          'Signal:number', // Will be refined when we sample
          block.type
        );
        // Immediately inspect
        this.inspectBlock(blockId);
      }
    }
  }

  /**
   * Check if a block is being probed.
   */
  isBlockProbed(blockId: string): boolean {
    const id = createProbeId({ kind: 'block', blockId });
    return this.probes.has(id);
  }

  /**
   * Get all active probe IDs.
   */
  get activeProbeIds(): string[] {
    return Array.from(this.probes.values())
      .filter(p => p.active)
      .map(p => p.id);
  }

  /**
   * Get all probed block IDs.
   */
  get probedBlockIds(): string[] {
    return Array.from(this.probes.values())
      .filter(p => p.target.kind === 'block' && p.active)
      .map(p => (p.target as { kind: 'block'; blockId: string }).blockId);
  }

  /**
   * Update a probe with a new sample.
   */
  updateProbe(id: string, value: ValueSummary, tMs: number): void {
    const probe = this.probes.get(id);
    if (!probe || !probe.active) return;

    const sample: Sample = {
      timestamp: Date.now(),
      tMs,
      value,
    };

    probe.currentSample = sample;

    // Add to history (maintain as bounded array)
    probe.history.push(sample);
    if (probe.history.length > probe.historyCapacity) {
      probe.history.shift();
    }
  }

  /**
   * Get auto-position for a probe in overlay grid.
   */
  getAutoPosition(index: number): { x: number; y: number } {
    const row = Math.floor(index / GRID_COLUMNS);
    const col = index % GRID_COLUMNS;
    return {
      x: GRID_PADDING + col * GRID_ITEM_WIDTH,
      y: GRID_PADDING + row * GRID_ITEM_HEIGHT,
    };
  }

  /**
   * Get overview status for Debug HUD.
   */
  getOverview(): DebugOverview {
    const store = this.getStore();
    const blocks = store.patchStore?.blocks ?? [];

    // Find TimeRoot
    const timeRoot = blocks.find((b) =>
      ['CycleTimeRoot', 'FiniteTimeRoot', 'InfiniteTimeRoot'].includes(b.type)
    );

    let timeMode: DebugOverview['timeMode'] = 'unknown';
    let period: number | undefined;

    if (timeRoot) {
      if (timeRoot.type === 'CycleTimeRoot') {
        timeMode = 'cyclic';
        period = Number(timeRoot.params?.periodMs ?? 3000);
      } else if (timeRoot.type === 'FiniteTimeRoot') {
        timeMode = 'finite';
        period = Number(timeRoot.params?.durationMs ?? 5000);
      } else {
        timeMode = 'infinite';
        period = Number(timeRoot.params?.periodMs ?? 10000);
      }
    }

    return {
      timeMode,
      period,
      health: 'ok', // TODO: integrate with diagnostics
      probeCount: this.probes.size,
      debuggedBlockIds: this.probedBlockIds,
    };
  }

  // ===========================================================================
  // Console (REPL)
  // ===========================================================================

  /**
   * Add a line to console output.
   */
  log(type: ConsoleLine['type'], content: string): void {
    this.consoleLines.push({
      id: this.nextLineId++,
      type,
      content,
      timestamp: Date.now(),
    });

    // Trim if too long
    if (this.consoleLines.length > CONSOLE_MAX_LINES) {
      this.consoleLines = this.consoleLines.slice(-CONSOLE_MAX_LINES);
    }
  }

  /**
   * Clear console.
   */
  clearConsole(): void {
    this.consoleLines = [];
    this.log('info', 'Console cleared');
  }

  /**
   * Execute a REPL command.
   */
  executeCommand(command: string): void {
    const trimmed = command.trim();
    if (!trimmed) return;

    // Add to history
    this.commandHistory.push(trimmed);
    this.historyIndex = this.commandHistory.length;

    // Echo command
    this.log('input', `> ${trimmed}`);

    // Parse and execute
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      switch (cmd) {
        case 'help':
          this.showHelp();
          break;
        case 'clear':
          this.clearConsole();
          break;
        case 'blocks':
          this.listBlocks();
          break;
        case 'block':
          this.inspectBlock(args[0]);
          break;
        case 'probe':
        case 'debug':
          this.toggleProbeCommand(args[0]);
          break;
        case 'probes':
          this.listProbes();
          break;
        case 'connections':
          this.listConnections();
          break;
        case 'buses':
          this.listBuses();
          break;
        case 'bus':
          this.inspectBus(args[0]);
          break;
        case 'state':
          this.showState();
          break;
        case 'overview':
          this.showOverview();
          break;
        case 'ir':
          this.inspectIR(args);
          break;
        case 'schedule':
          this.inspectSchedule(args);
          break;
        case 'eval':
          this.evalExpression(args.join(' '));
          break;
        default:
          // Try to evaluate as JS expression
          this.evalExpression(trimmed);
      }
    } catch (err) {
      this.log('error', `Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Navigate command history.
   */
  getPreviousCommand(): string | null {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      return this.commandHistory[this.historyIndex] ?? null;
    }
    return null;
  }

  getNextCommand(): string | null {
    if (this.historyIndex < this.commandHistory.length - 1) {
      this.historyIndex++;
      return this.commandHistory[this.historyIndex] ?? null;
    }
    this.historyIndex = this.commandHistory.length;
    return '';
  }

  // ===========================================================================
  // Commands
  // ===========================================================================

  private showHelp(): void {
    this.log('output', '━━━ Debug Commands ━━━');
    this.log('output', '  help         Show this help');
    this.log('output', '  clear        Clear console');
    this.log('output', '  overview     Show patch overview');
    this.log('output', '');
    this.log('output', '━━━ Blocks ━━━');
    this.log('output', '  blocks       List all blocks');
    this.log('output', '  block <id>   Inspect block by ID or label');
    this.log('output', '  probe <id>   Toggle probe on block');
    this.log('output', '  probes       List active probes');
    this.log('output', '');
    this.log('output', '━━━ Buses ━━━');
    this.log('output', '  buses        List all buses');
    this.log('output', '  bus <id>     Inspect bus by ID');
    this.log('output', '  connections  List all connections');
    this.log('output', '');
    this.log('output', '━━━ IR & Schedule ━━━');
    this.log('output', '  ir           Show IR summary');
    this.log('output', '  ir nodes     List all IR nodes');
    this.log('output', '  ir buses     List all IR buses');
    this.log('output', '  ir node <id> Inspect specific IR node');
    this.log('output', '  schedule     Show schedule overview');
    this.log('output', '  schedule step <n> Inspect step at index');
    this.log('output', '');
    this.log('output', '━━━ Advanced ━━━');
    this.log('output', '  state        Show UI state');
    this.log('output', '  eval <expr>  Evaluate JS expression');
    this.log('output', '');
    this.log('output', 'Or type any JavaScript expression to evaluate it.');
  }

  private showOverview(): void {
    const overview = this.getOverview();
    this.log('output', '━━━ Patch Overview ━━━');
    this.log('output', `  Time Mode: ${overview.timeMode}`);
    if (overview.period) {
      this.log('output', `  Period: ${overview.period}ms`);
    }
    this.log('output', `  Health: ${overview.health}`);
    this.log('output', `  Active Probes: ${overview.probeCount}`);
    if (overview.debuggedBlockIds.length > 0) {
      this.log('output', `  Probed Blocks: ${overview.debuggedBlockIds.join(', ')}`);
    }
  }

  private listBlocks(): void {
    const store = this.getStore();
    const blocks = store?.patchStore?.blocks ?? [];

    if (blocks.length === 0) {
      this.log('output', 'No blocks in patch');
      return;
    }

    this.log('output', `━━━ Blocks (${blocks.length}) ━━━`);
    for (const block of blocks) {
      const probed = this.isBlockProbed(block.id) ? ' [probed]' : '';
      this.log('output', `  ${block.id}: ${block.type} "${block.label}"${probed}`);
    }
  }

  inspectBlock(idOrLabel?: string): void {
    if (!idOrLabel) {
      this.log('error', 'Usage: block <id or label>');
      return;
    }

    const block = this.findBlock(idOrLabel);
    if (!block) {
      this.log('error', `Block not found: ${idOrLabel}`);
      return;
    }

    const store = this.getStore();

    this.log('output', `━━━ Block: ${block.label} ━━━`);
    this.log('output', `  ID: ${block.id}`);
    this.log('output', `  Type: ${block.type}`);
    this.log('output', `  Category: ${block.category}`);

    // Show probe status and current value
    const probeId = createProbeId({ kind: 'block', blockId: block.id });
    const probe = this.probes.get(probeId);
    if (probe?.currentSample) {
      const value = formatValueSummary(probe.currentSample.value);
      const age = Date.now() - probe.currentSample.timestamp;
      this.log('output', `  Current Value: ${value} (${age}ms ago)`);

      // Show mini sparkline if we have history
      if (probe.history.length > 1) {
        const sparkline = this.generateSparkline(probe.history, 20);
        this.log('output', `  History: ${sparkline}`);
      }
    } else if (probe) {
      this.log('output', '  Current Value: waiting for sample...');
    }

    // Show inputs
    if (block.inputs && block.inputs.length > 0) {
      this.log('output', '  Inputs:');
      for (const input of block.inputs) {
        const typeStr = input.typeDesc?.type ?? 'any';
        const connections = store.patchStore?.connections ?? [];
        const conn = connections.find(
          (c) => c.toBlock === block.id && c.toSlot === input.id
        );
        const connInfo = conn
          ? ` ← ${conn.fromBlock}.${conn.fromSlot}`
          : ' (unconnected)';
        this.log('output', `    ${input.id}: ${typeStr}${connInfo}`);
      }
    }

    // Show outputs
    if (block.outputs && block.outputs.length > 0) {
      this.log('output', '  Outputs:');
      for (const output of block.outputs) {
        const typeStr = output.typeDesc?.type ?? 'any';
        const connections = store.patchStore?.connections ?? [];
        const conns = connections.filter(
          (c) => c.fromBlock === block.id && c.fromSlot === output.id
        );
        const connInfo = conns.length > 0
          ? ` → ${conns.map((c) => `${c.toBlock}.${c.toSlot}`).join(', ')}`
          : '';
        this.log('output', `    ${output.id}: ${typeStr}${connInfo}`);
      }
    }

    // Show bus connections
    const allPublishers = store.busStore?.publishers ?? [];
    const allListeners = store.busStore?.listeners ?? [];
    const publishers = allPublishers.filter((p) => p.blockId === block.id);
    const listeners = allListeners.filter((l) => l.blockId === block.id);

    if (publishers.length > 0) {
      this.log('output', '  Publishing to:');
      for (const pub of publishers) {
        this.log('output', `    ${pub.slotId} → bus:${pub.busId}`);
      }
    }

    if (listeners.length > 0) {
      this.log('output', '  Listening to:');
      for (const lis of listeners) {
        this.log('output', `    ${lis.slotId} ← bus:${lis.busId}`);
      }
    }

    // Show parameters
    const paramKeys = Object.keys(block.params ?? {});
    if (paramKeys.length > 0) {
      this.log('output', '  Parameters:');
      for (const key of paramKeys) {
        const value = block.params[key];
        const valueStr = typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
        this.log('output', `    ${key}: ${valueStr}`);
      }
    }
  }

  private toggleProbeCommand(idOrLabel?: string): void {
    if (!idOrLabel) {
      // Show current probes
      this.listProbes();
      return;
    }

    const block = this.findBlock(idOrLabel);
    if (!block) {
      this.log('error', `Block not found: ${idOrLabel}`);
      return;
    }

    this.toggleBlockProbe(block.id);
  }

  private listProbes(): void {
    if (this.probes.size === 0) {
      this.log('output', 'No active probes');
      this.log('output', 'Use "probe <blockId>" to start probing a block');
      return;
    }

    this.log('output', `━━━ Active Probes (${this.probes.size}) ━━━`);
    for (const probe of this.probes.values()) {
      let value = '—';
      let age = '';

      if (probe.currentSample) {
        value = formatValueSummary(probe.currentSample.value);
        age = ` [${Date.now() - probe.currentSample.timestamp}ms ago]`;
      }

      this.log('output', `  ${probe.label}: ${value}${age}`);
    }
  }

  private listConnections(): void {
    const store = this.getStore();
    const connections = store?.patchStore?.connections ?? [];

    if (connections.length === 0) {
      this.log('output', 'No connections');
      return;
    }

    this.log('output', `━━━ Connections (${connections.length}) ━━━`);
    for (const conn of connections) {
      this.log('output', `  ${conn.fromBlock}.${conn.fromSlot} → ${conn.toBlock}.${conn.toSlot}`);
    }
  }

  private listBuses(): void {
    const store = this.getStore();
    const buses = store.busStore?.buses ?? [];
    const allPubs = store.busStore?.publishers ?? [];
    const allLis = store.busStore?.listeners ?? [];

    if (buses.length === 0) {
      this.log('output', 'No buses');
      return;
    }

    this.log('output', `━━━ Buses (${buses.length}) ━━━`);
    for (const bus of buses) {
      const pubCount = allPubs.filter((p) => p.busId === bus.id).length;
      const lisCount = allLis.filter((l) => l.busId === bus.id).length;
      this.log('output', `  ${bus.id}: "${bus.name}" (${bus.typeDesc?.type ?? '?'}) - ${pubCount}p/${lisCount}l`);
    }
  }

  private inspectBus(busId?: string): void {
    if (!busId) {
      this.log('error', 'Usage: bus <id>');
      return;
    }

    const store = this.getStore();
    const buses = store.busStore?.buses ?? [];
    const bus = buses.find(
      (b) => b.id === busId || b.name.toLowerCase() === busId.toLowerCase()
    );

    if (!bus) {
      this.log('error', `Bus not found: ${busId}`);
      return;
    }

    this.log('output', `━━━ Bus: ${bus.name} ━━━`);
    this.log('output', `  ID: ${bus.id}`);
    this.log('output', `  Type: ${bus.typeDesc?.type ?? 'unknown'}`);

    const allPubs = store.busStore?.publishers ?? [];
    const allLis = store.busStore?.listeners ?? [];
    const publishers = allPubs.filter((p) => p.busId === bus.id);
    const listeners = allLis.filter((l) => l.busId === bus.id);

    if (publishers.length > 0) {
      this.log('output', '  Publishers:');
      for (const pub of publishers) {
        this.log('output', `    ${pub.blockId}.${pub.slotId}`);
      }
    }

    if (listeners.length > 0) {
      this.log('output', '  Listeners:');
      for (const lis of listeners) {
        this.log('output', `    ${lis.blockId}.${lis.slotId}`);
      }
    }
  }

  private showState(): void {
    const store = this.getStore();
    const ui = store?.uiStore?.uiState;
    const settings = store?.uiStore?.settings;
    const patch = store?.patchStore;

    this.log('output', '━━━ Current State ━━━');
    this.log('output', `  Selected Block: ${ui?.selectedBlockId ?? 'none'}`);
    this.log('output', `  Playing: ${ui?.isPlaying ?? false}`);
    this.log('output', `  Seed: ${settings?.seed ?? 0}`);
    this.log('output', `  Speed: ${settings?.speed ?? 1}x`);
    this.log('output', `  Blocks: ${patch?.blocks?.length ?? 0}`);
    this.log('output', `  Connections: ${patch?.connections?.length ?? 0}`);
    this.log('output', `  Revision: ${patch?.patchRevision ?? 0}`);
    this.log('output', `  Active Probes: ${this.probes.size}`);
  }

  /**
   * IR inspection commands: `ir`, `ir errors`, `ir nodes`, `ir buses`, `ir node <id>`
   */
  private inspectIR(args: string[]): void {
    const result = this.getCompileResult();
    const programIR = result?.programIR;
    const subCmd = args[0]?.toLowerCase();

    // Handle 'errors' subcommand - always show errors even if compilation failed
    if (subCmd === 'errors') {
      if (!result) {
        this.log('error', 'No compile result available. Compile a patch first.');
        return;
      }
      if (result.errors.length === 0) {
        this.log('output', 'No compile errors.');
        return;
      }
      this.log('output', `━━━ Compile Errors (${result.errors.length}) ━━━`);
      for (const err of result.errors) {
        const location = err.where?.blockId
          ? ` @ ${err.where.blockId}${err.where.port ? '.' + err.where.port : ''}`
          : '';
        this.log('error', `  [${err.code}]${location}`);
        this.log('error', `    ${err.message}`);
      }
      return;
    }

    // If no programIR but we have errors, show the errors
    if (!programIR) {
      if (result && result.errors.length > 0) {
        this.log('error', `Compilation failed with ${result.errors.length} error(s):`);
        for (const err of result.errors) {
          const location = err.where?.blockId
            ? ` @ ${err.where.blockId}${err.where.port ? '.' + err.where.port : ''}`
            : '';
          this.log('error', `  [${err.code}]${location}`);
          this.log('error', `    ${err.message}`);
        }
        this.log('output', '\nTip: Use "ir errors" to see full error details');
        return;
      }
      this.log('error', 'No IR available. Compile a patch first.');
      return;
    }

    if (!subCmd) {
      // Show IR summary
      this.log('output', '━━━ IR Summary ━━━');
      this.log('output', `  Status: ${result?.ok ? 'OK' : 'FAILED'}`);
      this.log('output', `  IR Version: ${programIR.irVersion}`);
      this.log('output', `  Patch ID: ${programIR.patchId}`);
      this.log('output', `  Seed: ${programIR.seed}`);

      const nodeCount = programIR.nodes?.nodes?.length ?? 0;
      const busCount = programIR.buses?.buses?.length ?? 0;

      this.log('output', `  Node Count: ${nodeCount}`);
      this.log('output', `  Bus Count: ${busCount}`);
      this.log('output', `  Time Model: ${programIR.timeModel.kind}`);

      if (programIR.timeModel.kind === 'cyclic' && 'periodMs' in programIR.timeModel) {
        this.log('output', `  Period: ${programIR.timeModel.periodMs}ms`);
      } else if (programIR.timeModel.kind === 'finite' && 'durationMs' in programIR.timeModel) {
        this.log('output', `  Duration: ${programIR.timeModel.durationMs}ms`);
      }
      return;
    }

    if (subCmd === 'nodes') {
      // List all nodes
      const nodes = programIR.nodes?.nodes ?? [];
      if (nodes.length === 0) {
        this.log('output', 'No nodes in IR');
        return;
      }

      this.log('output', `━━━ IR Nodes (${nodes.length}) ━━━`);
      for (const node of nodes) {
        this.log('output', `  ${node.id}: typeId=${node.typeId} (${node.inputCount} in, ${node.outputCount} out)`);
      }
      return;
    }

    if (subCmd === 'buses') {
      // List all buses
      const buses = programIR.buses?.buses ?? [];
      if (buses.length === 0) {
        this.log('output', 'No buses in IR');
        return;
      }

      this.log('output', `━━━ IR Buses (${buses.length}) ━━━`);
      for (const bus of buses) {
        const busType = bus.type ? JSON.stringify(bus.type) : 'unknown';
        this.log('output', `  ${bus.id}: ${busType}`);
      }
      return;
    }

    if (subCmd === 'node') {
      // Inspect specific node
      const nodeId = args[1];
      if (!nodeId) {
        this.log('error', 'Usage: ir node <id>');
        return;
      }

      const node = programIR.nodes.nodes.find((n) => n.id === nodeId);
      if (!node) {
        this.log('error', `IR node not found: ${nodeId}`);
        return;
      }

      this.log('output', `━━━ IR Node: ${nodeId} ━━━`);
      this.log('output', `  TypeId: ${node.typeId}`);
      this.log('output', `  Inputs: ${node.inputCount}`);
      this.log('output', `  Outputs: ${node.outputCount}`);
      if (node.compilerTag !== undefined) {
        this.log('output', `  CompilerTag: ${node.compilerTag}`);
      }
      return;
    }

    this.log('error', `Unknown IR subcommand: ${subCmd}`);
    this.log('error', 'Usage: ir | ir errors | ir nodes | ir buses | ir node <id>');
  }

  /**
   * Schedule inspection commands: `schedule`, `schedule step <n>`
   */
  private inspectSchedule(args: string[]): void {
    const programIR = this.getProgramIR();
    if (!programIR) {
      this.log('error', 'No schedule available. Compile a patch first.');
      return;
    }

    const schedule = programIR.schedule;
    if (!schedule || !schedule.steps) {
      this.log('error', 'No schedule in IR');
      return;
    }

    const steps = schedule.steps;
    const subCmd = args[0]?.toLowerCase();

    if (!subCmd) {
      // Show schedule overview
      this.log('output', '━━━ Schedule Overview ━━━');
      this.log('output', `  Step Count: ${steps.length}`);
      this.log('output', `  Time Model: ${programIR.timeModel.kind}`);

      // Count steps by kind
      const kindCounts: Record<string, number> = {};
      for (const step of steps) {
        kindCounts[step.kind] = (kindCounts[step.kind] || 0) + 1;
      }

      this.log('output', '  Step Kinds:');
      for (const [kind, count] of Object.entries(kindCounts)) {
        this.log('output', `    ${kind}: ${count}`);
      }
      return;
    }

    if (subCmd === 'step') {
      // Inspect specific step
      const stepIndexStr = args[1];
      if (!stepIndexStr) {
        this.log('error', 'Usage: schedule step <index>');
        return;
      }

      const stepIndex = parseInt(stepIndexStr, 10);
      if (isNaN(stepIndex) || stepIndex < 0 || stepIndex >= steps.length) {
        this.log('error', `Invalid step index: ${stepIndexStr} (valid: 0-${steps.length - 1})`);
        return;
      }

      const step = steps[stepIndex];
      this.log('output', `━━━ Schedule Step ${stepIndex} ━━━`);
      this.log('output', `  Kind: ${step.kind}`);

      // Show step details as JSON
      const stepJson = JSON.stringify(step, null, 2);
      for (const line of stepJson.split('\n')) {
        this.log('output', `  ${line}`);
      }
      return;
    }

    this.log('error', `Unknown schedule subcommand: ${subCmd}`);
    this.log('error', 'Usage: schedule | schedule step <index>');
  }

  private evalExpression(expr: string): void {
    if (!expr) {
      this.log('error', 'Usage: eval <expression>');
      return;
    }

    try {
      const store = this.getStore();
      const context = {
        store,
        patchStore: store?.patchStore,
        busStore: store?.busStore,
        uiStore: store?.uiStore,
        viewStore: store?.viewStore,
        debugStore: this,
        probes: this.probes,
      };

      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function(...Object.keys(context), `return (${expr})`);
      const result = fn(...Object.values(context));

      // Format result
      if (result === undefined) {
        this.log('output', 'undefined');
      } else if (result === null) {
        this.log('output', 'null');
      } else if (typeof result === 'object') {
        try {
          const json = JSON.stringify(result, null, 2);
          for (const line of json.split('\n')) {
            this.log('output', line);
          }
        } catch {
          this.log('output', String(result));
        }
      } else {
        this.log('output', String(result));
      }
    } catch (err) {
      this.log('error', `${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private getStore(): RootStore {
    return (window as unknown as { __rootStore: RootStore }).__rootStore ?? {};
  }

  /**
   * Get the full compile result from window.__compilerService
   */
  private getCompileResult(): {
    ok: boolean;
    errors: CompileError[];
    programIR?: CompiledProgramIR;
    ir?: unknown;
  } | null {
    const compilerService = (window as unknown as {
      __compilerService?: { getLatestResult(): unknown }
    }).__compilerService;

    if (!compilerService) return null;

    const result = compilerService.getLatestResult();
    if (!result || typeof result !== 'object') return null;

    return result as {
      ok: boolean;
      errors: CompileError[];
      programIR?: CompiledProgramIR;
      ir?: unknown;
    };
  }

  /**
   * Get the compiled program IR from window.__compilerService
   */
  private getProgramIR(): CompiledProgramIR | null {
    const result = this.getCompileResult();
    return result?.programIR ?? null;
  }

  private findBlock(idOrLabel: string): StoreBlock | undefined {
    const store = this.getStore();
    const blocks = store.patchStore?.blocks ?? [];

    return blocks.find((block) => {
      return (
        block.id === idOrLabel ||
        block.label?.toLowerCase() === idOrLabel.toLowerCase() ||
        block.id?.endsWith(idOrLabel)
      );
    });
  }

  private triggerRecompile(): void {
    try {
      const store = this.getStore();
      store.patchStore?.incrementRevision?.();
    } catch {
      // Silently fail if store not available
    }
  }

  /**
   * Generate a simple ASCII sparkline from sample history.
   */
  private generateSparkline(samples: Sample[], width: number): string {
    if (samples.length < 2) return '';

    const values = samples
      .map(s => getNumericValue(s.value))
      .filter((v): v is number => v !== null);

    if (values.length < 2) return '';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const step = Math.max(1, Math.floor(values.length / width));

    let result = '';
    for (let i = 0; i < values.length; i += step) {
      const value = values[i];
      const normalized = (value - min) / range;
      const charIndex = Math.min(chars.length - 1, Math.floor(normalized * chars.length));
      result += chars[charIndex];
    }

    return result;
  }

  // ===========================================================================
  // Legacy API (for backward compatibility with debugSampler)
  // ===========================================================================

  /** @deprecated Use isBlockProbed */
  isBlockDebugging(blockId: string): boolean {
    return this.isBlockProbed(blockId);
  }

  /** @deprecated Use probedBlockIds */
  get debuggingBlockIds(): string[] {
    return this.probedBlockIds;
  }

  /** @deprecated Use toggleBlockProbe */
  toggleBlockDebug(blockId: string): void {
    this.toggleBlockProbe(blockId);
  }

  /** @deprecated Use updateProbe */
  setEntry(entry: {
    id: string;
    label: string;
    posX: number;
    posY: number;
    values: {
      signal?: number;
      phase?: number;
      domainCount?: number;
      fieldSample?: number[];
    };
    timestamp: number;
  }): void {
    const probeId = createProbeId({ kind: 'block', blockId: entry.id });
    let probe = this.probes.get(probeId);

    if (!probe) {
      // Create probe if it doesn't exist
      probe = {
        id: probeId,
        target: { kind: 'block', blockId: entry.id },
        label: entry.label,
        artifactKind: entry.values.phase !== undefined ? 'Signal:phase' : 'Signal:number',
        blockType: undefined,
        currentSample: undefined,
        history: [],
        historyCapacity: HISTORY_CAPACITY,
        active: true,
        position: { x: entry.posX, y: entry.posY },
      };
      this.probes.set(probeId, probe);
    }

    // Create value summary
    let value: ValueSummary;
    if (entry.values.phase !== undefined) {
      value = { t: 'phase', v: entry.values.phase };
    } else if (entry.values.signal !== undefined) {
      value = { t: 'num', v: entry.values.signal };
    } else if (entry.values.domainCount !== undefined) {
      value = { t: 'num', v: entry.values.domainCount };
    } else {
      value = { t: 'none' };
    }

    const sample: Sample = {
      timestamp: entry.timestamp,
      tMs: 0, // Not available in legacy API
      value,
    };

    probe.currentSample = sample;
    probe.history.push(sample);
    if (probe.history.length > probe.historyCapacity) {
      probe.history.shift();
    }
  }

  /** @deprecated Use consoleLines */
  get replLines(): ConsoleLine[] {
    return this.consoleLines;
  }

  /** @deprecated Use clearConsole */
  clearRepl(): void {
    this.clearConsole();
  }

  /** @deprecated Use log */
  addReplLine(type: ConsoleLine['type'], content: string): void {
    this.log(type, content);
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const debugStore = new DebugStore();
