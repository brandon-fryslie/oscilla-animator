### Plan: Oscilla Debugger Pre-Work

**Directory:** `design-docs/11-Debugger/_planning/gemini/`

---

#### Sprint 1: Foundation Laying & Core Data Structures

**Objective:** Establish the low-level, performant data structures and interfaces that the debugger will rely on, ensuring efficiency and boundedness as per the design documents.

*   **Task 1.1: Implement `DebugTap` Interface**
    *   **Description:** Define the `DebugTap` interface in `src/core/debug.ts`. This interface will be the primary mechanism for the runtime and compiler to report debug information. It must be designed to be non-allocating and check its `level` property before performing any actions.
    *   **Details:**
        *   Define `DebugLevel` enum (OFF, BASIC, TRACE, PERF, FULL).
        *   Define `DebugTap` with optional methods: `onDebugGraph?`, `onSnapshot?`, `hitMaterialize?`, `hitAdapter?`, `hitLens?`, `recordBusNow?`, `recordBindingNow?`.
        *   Ensure each method is designed for low-to-no allocation and conditionally executes based on `DebugLevel`.
    *   **Acceptance Criteria:** `DebugTap` interface is accurately defined in `src/core/debug.ts`. A dummy, no-op implementation is created that can be safely passed and called without errors.

*   **Task 1.2: Implement `ValueSummary` Type and `summarize` Function**
    *   **Description:** Create a uniform, low-allocation `ValueSummary` tagged union type and a corresponding `summarize` utility function. This is critical for efficient and consistent value representation in runtime snapshots.
    *   **Details:**
        *   Define `ValueSummary` type in `src/core/debug.ts` to cover `num`, `vec2`, `color`, `phase`, `bool`, `trigger`, `none`, `err` types, as specified in `3-NonTech-LowLevel.md`.
        *   Implement `summarize(type: TypeDesc, value: unknown): ValueSummary` function, handling conversion for each `TypeDesc` world.
        *   Ensure `NaN`/`Inf` values are correctly mapped to `{ t: 'err', code: 'nan' }` or similar.
        *   Color values should be packed into a `u32`.
        *   Fields should always summarize as `{ t: 'none' }` initially.
    *   **Acceptance Criteria:** `ValueSummary` type and `summarize` function are implemented, with unit tests confirming correct type conversion and error handling for `NaN`/`Inf`.

*   **Task 1.3: Develop Bounded Data Structures for Runtime Efficiency**
    *   **Task 1.3.1: `FixedTopKCounter<K>` Implementation**
        *   **Description:** Create a generic `FixedTopKCounter<K>` class (e.g., in `src/core/utils/FixedTopKCounter.ts`) to track "heavy hitters" without unbounded memory growth.
        *   **Details:**
            *   Implement `hit(key: K)` method to increment counts.
            *   Maintain a fixed-size internal array (e.g., top 8 elements).
            *   Implement "space-saving" algorithm (increment if exists, insert if room, otherwise decrement minimum) for bounded updates.
            *   Add a `getTopK()` method to retrieve current top elements.
        *   **Acceptance Criteria:** `FixedTopKCounter` is implemented, with unit tests verifying its bounded size, accurate hit counts, and correct top-K retrieval.
    *   **Task 1.3.2: Generic `RingBuffer<T>` for Time History**
        *   **Description:** Implement a generic `RingBuffer<T>` class (e.g., in `src/core/utils/RingBuffer.ts`) optimized for efficient storage and retrieval of time-series data.
        *   **Details:**
            *   Methods for `push(item: T)`, `get(index: number)`, and `getAll()`.
            *   Handle circular buffer logic efficiently.
            *   Consider using Typed Arrays for numeric `ValueSummary` types for maximum efficiency.
        *   **Acceptance Criteria:** `RingBuffer` class is implemented, tested for correct circular behavior, and can efficiently store and retrieve data, especially `ValueSummary` objects.

*   **Task 1.4: Standardize Canonical Identifiers**
    *   **Description:** Review existing ID generation and usage to conform to the specified canonical string formats (`PortKey`, `BindingKey`, `BusKey`, `StageKey`). Create helper functions for their creation and parsing if necessary.
    *   **Details:**
        *   Define string literal types or constants for these keys.
        *   Update relevant compiler/store logic to use these consistent string formats.
    *   **Acceptance Criteria:** All internal IDs for ports, buses, and bindings conform to the specified canonical string formats. Helper functions exist for creating them.

*   **Task 1.5: Centralize Field Materialization Tap Point**
    *   **Description:** Identify the precise function or module where lazy Field evaluation results in concrete array allocation (`Field.materialize` equivalent). Wrap this logic to accept a `DebugTap` and call `tap?.hitMaterialize()` at this point.
    *   **Details:**
        *   Locate the field materialization entry point.
        *   Modify the function signature to accept an optional `DebugTap` instance.
        *   Add a call to `tap?.hitMaterialize({ blockId: string, reason: string })`.
    *   **Acceptance Criteria:** A single, well-defined tap point for field materialization exists, allowing `DebugTap` to record these events.

---

#### Sprint 2: Compiler Integration & DebugGraph Generation

**Objective:** Modify the existing compiler to generate the static `DebugGraph`, enabling the debugger to understand the static structure of the patch.

*   **Task 2.1: Extend Compiler Result Type**
    *   **Description:** Update the compiler's output type definition to include the newly defined `DebugGraph` structure.
    *   **Details:**
        *   Modify the return type of the main compilation function (e.g., `compilePatch`) to include an optional `debugGraph: DebugGraph | null`.
    *   **Acceptance Criteria:** The compiler's public API can now return a `DebugGraph` object.

*   **Task 2.2: Implement `DebugGraph` Data Models in Compiler Layer**
    *   **Description:** Translate the `DebugGraph`, `DebugBusNode`, `DebugPublisherNode`, `DebugListenerNode`, `DebugPipeline`, and `DebugStage` interfaces (`2-NonTech-Arch.md`) into concrete TypeScript types within a new compiler-specific debug module (e.g., `src/editor/compiler/debug/types.ts`).
    *   **Details:**
        *   Define interfaces for all DebugGraph components as described in the design document.
    *   **Acceptance Criteria:** All `DebugGraph`-related types are accurately defined and available to the compiler.

*   **Task 2.3: Populate `DebugBusNode`s During Bus Compilation**
    *   **Description:** Modify the bus compilation phase to extract and store all necessary information to create `DebugBusNode`s for each bus.
    *   **Details:**
        *   During the resolution of bus definitions, capture `id`, `name`, `type`, `combineMode`, a `defaultValueSummary` (using Task 1.2's `summarize` function), `publisherIds`, `listenerIds`, and `reservedRole`.
    *   **Acceptance Criteria:** The compiler successfully generates a `DebugBusNode` for every bus in the patch.

*   **Task 2.4: Populate `DebugPublisherNode`s and `DebugListenerNode`s**
    *   **Description:** During the publisher and listener resolution phase, collect and store data to create `DebugPublisherNode`s and `DebugListenerNode`s.
    *   **Details:**
        *   For each publisher/listener, record `id`, `busId`, `from`/`to` (`BindingEndpoint`), `fromPortKey`/`toPortKey`, `enabled` status, the resolved `adapterChain`, and the `lensStack`.
        *   Ensure `adapterChain` and `lensStack` details match the `DebugStage` definition.
    *   **Acceptance Criteria:** The compiler accurately generates `DebugPublisherNode`s and `DebugListenerNode`s for all bindings.

*   **Task 2.5: Build `byPort` Lookup Map in `DebugGraph`**
    *   **Description:** Implement the logic within the compiler to construct the `byPort` map for `DebugGraph`, enabling fast reverse lookups from `PortKey` to relevant bindings and connections.
    *   **Details:**
        *   Iterate through all connections, publishers, and listeners to populate `incomingListeners`, `outgoingPublishers`, `wiredIncoming`, and `wiredOutgoing` arrays for each `PortKey`.
    *   **Acceptance Criteria:** The `byPort` map within `DebugGraph` is correctly populated and provides accurate reverse lookup capabilities.

*   **Task 2.6: Precompute `DebugPipeline`s for Bindings**
    *   **Description:** Implement the logic to precompute the `DebugPipeline` for each publisher and listener binding. This involves transforming the resolved adapter chains and lens stacks into `DebugStage` arrays.
    *   **Details:**
        *   For each `BindingKey`, create a `DebugPipeline` object.
        *   Map the adapter chain and lens stack into the appropriate `DebugStage` types (`source`, `adapter`, `lens`, `combine`).
    *   **Acceptance Criteria:** `DebugPipeline`s are correctly generated for all bindings, providing the detailed "source chain" information required for Probe mode.

*   **Task 2.7: Integrate Compiler `DebugTap` Call**
    *   **Description:** Add the call `tap?.onDebugGraph?.(debugGraph)` at the completion of the `compilePatch` (or `compileBusAwarePatch`) function in the compiler, ensuring the generated `DebugGraph` is emitted.
    *   **Details:**
        *   Ensure the `DebugTap` instance is accessible within the compiler.
    *   **Acceptance Criteria:** The `DebugGraph` is successfully passed to the `DebugTap` at the end of compilation if a tap is active.

*   **Task 2.8: Add `busIndexById` and `bindingIndexById` to `DebugGraph`**
    *   **Description:** Enhance the `DebugGraph` with maps (`Map<BusId, number>`, `Map<BindingId, number>`) to provide stable integer indices for buses and bindings. This is crucial for the `DebugRecorder`'s non-allocating array-based storage.
    *   **Details:**
        *   During `DebugGraph` construction, assign a unique, stable integer index to each `BusId` and `BindingId`.
    *   **Acceptance Criteria:** `DebugGraph` contains `busIndexById` and `bindingIndexById` maps, correctly populated during compilation, enabling efficient runtime indexing.

*   **Task 2.9: Basic `DebugService` Skeleton Implementation**
    *   **Description:** Create a new `DebugService` class (e.g., `src/editor/services/DebugService.ts`). This service will act as the central repository for debugger data and expose APIs for the UI.
    *   **Details:**
        *   Implement a skeleton `DebugService` with methods: `setDebugGraph(g: DebugGraph): void`, `pushSnapshot(s: DebugSnapshot): void`, and `setLevel(level: DebugLevel): void`.
        *   The service should store the latest `DebugGraph` and prepare for snapshot storage (using ring buffers from Task 1.3.2).
    *   **Acceptance Criteria:** A basic `DebugService` is in place, capable of receiving and holding the `DebugGraph` and managing the debug level.
