# Plan: Implement IR Compiler Toggle

This plan details the steps required to add a UI toggle for switching between the legacy (closure-based) compiler and the new IR-based compiler. This allows for safe comparison and debugging.

## 1. Add State Management for the Switch

**File:** `src/editor/stores/UIStateStore.ts`

**Objective:** Create a central, observable state to control which compiler runtime is active.

### Changes:

- Add a new `@observable` property `useNewCompiler` to the `settings` object, defaulting to `false`.
- Add a new `@action` `setUseNewCompiler` to modify this state.

```typescript
// In UIStateStore class

// ... inside the settings object
export class UIStateStore {
  // ...
  settings = {
    seed: 0,
    speed: 1.0,
    // ... existing settings
    useNewCompiler: false, // <-- Add this
  };
  // ...

  constructor(root: RootStore) {
    makeObservable(this, {
      // ...
      setUseNewCompiler: action, // <-- Add this
    });
  }

  // ...

  // Add this new action at the end of the class
  setUseNewCompiler(enabled: boolean): void {
    this.settings.useNewCompiler = enabled;
  }
}
```

*(Note: The exact placement of `useNewCompiler` inside `settings` and the `makeObservable` call needs to be adjusted to match the existing code structure precisely.)*

## 2. Create the UI Toggle Button

**File:** `src/editor/SettingsToolbar.tsx`

**Objective:** Add a button to the main toolbar to control the new compiler state.

### Changes:

- Access the `uiStore` to get the `useNewCompiler` state and the `setUseNewCompiler` action.
- Add a new `<button>` to the toolbar.
- The button's `onClick` handler will toggle the state: `store.uiStore.setUseNewCompiler(!store.uiStore.settings.useNewCompiler)`.
- The button's text or style will change to indicate whether the "IR Compiler" is "On" or "Off".

```tsx
// In SettingsToolbar component

const SettingsToolbar = observer(() => {
  const store = useStore();
  // ...

  const handleToggleCompiler = () => {
    store.uiStore.setUseNewCompiler(!store.uiStore.settings.useNewCompiler);
  };

  return (
    <div className="settings-toolbar">
      {/* ... other buttons ... */}
      <button
        className={`toolbar-btn compiler-toggle ${store.uiStore.settings.useNewCompiler ? 'active' : ''}`}
        onClick={handleToggleCompiler}
        title={`Switch to ${store.uiStore.settings.useNewCompiler ? 'Legacy' : 'IR'} Compiler`}
      >
        <span>IR</span>
        <span className={`compiler-status ${store.uiStore.settings.useNewCompiler ? 'on' : 'off'}`}>
          {store.uiStore.settings.useNewCompiler ? 'On' : 'Off'}
        </span>
      </button>
      {/* ... other buttons ... */}
    </div>
  );
});
```

*(Note: CSS for `.compiler-toggle`, `.compiler-status`, `.on`, `.off` would need to be added separately to style the button.)*

## 3. Make the Player Respect the Toggle

**File:** `src/editor/PreviewPanel.tsx`

**Objective:** Modify the component that feeds the player to use the `useNewCompiler` flag to select the correct program source.

### Changes:

- In the `useEffect` hook that contains the polling `setInterval`, read the `useNewCompiler` flag from the store.
- Wrap the program-loading logic in an `if/else` based on this flag.

```typescript
// In PreviewPanel's polling `useEffect` hook

useEffect(() => {
  // ...
  const interval = setInterval(() => {
    const result = compilerService.getLatestResult();
    const useIR = store.uiStore.settings.useNewCompiler; // <-- Get the flag

    if (result && result.ok) {
      const player = playerRef.current;
      if (!player) return;

      // === NEW LOGIC ===
      if (useIR && result.compiledIR) {
        // --- IR PATH ---
        const adapter = new IRRuntimeAdapter(result.compiledIR);
        const irProgram = adapter.createProgram();

        // Use a ref to store the program for the canvas render loop
        lastGoodIRProgramRef.current = irProgram;
        lastGoodCanvasProgramRef.current = null; // Clear old path
        lastGoodProgramRef.current = null;       // Clear old path

        setActiveRenderer('canvas');
        player.setFactory(() => EMPTY_PROGRAM); // Player only used for time
        player.applyTimeModel(result.compiledIR.timeModel);
        setTimeModel(result.compiledIR.timeModel);
        logStore.debug('renderer', 'Switched to IR program (Canvas)');

      } else {
        // --- LEGACY PATH (FALLBACK) ---
        lastGoodIRProgramRef.current = null; // Clear IR path
        if (result.canvasProgram) {
          lastGoodCanvasProgramRef.current = result.canvasProgram;
          setActiveRenderer('canvas');
          player.setFactory(() => EMPTY_PROGRAM); // Player only for time
          player.applyTimeModel(result.timeModel!);
          setTimeModel(result.timeModel!);
          logStore.debug('renderer', 'Switched to Legacy Canvas program');
        } else if (result.program) {
          // Legacy SVG path
          const program = result.program as any;
          lastGoodProgramRef.current = program;
          setActiveRenderer('svg');
          player.setFactory(() => program);
          player.applyTimeModel(result.timeModel!);
          setTimeModel(result.timeModel!);
          logStore.debug('renderer', 'Switched to Legacy SVG program');
        }
      }
    }
    // ...
  }, 500);
  // ...
}, [/* dependencies */, store.uiStore.settings.useNewCompiler]); // <-- Add flag to dependencies
```

- **Also add the `lastGoodIRProgramRef` and update the canvas render loop `useEffect` as planned in the previous turn.**

```typescript
// Top of PreviewPanel component
const lastGoodIRProgramRef = useRef<Program<RenderTree> | null>(null);

// ...

// Inside the canvas render loop useEffect
const renderFrame = () => {
  // ...
  let renderTree: RenderTree | null = null;

  // Prioritize the new IR program
  if (lastGoodIRProgramRef.current) {
    renderTree = lastGoodIRProgramRef.current.signal(tMs, ctx);
  }
  // Fallback to the old canvas program
  else if (lastGoodCanvasProgramRef.current) {
    renderTree = lastGoodCanvasProgramRef.current.signal(tMs, ctx);
  }

  if (renderTree) {
    canvasRenderer.render(renderTree as any);
  }
  // ...
};
```
