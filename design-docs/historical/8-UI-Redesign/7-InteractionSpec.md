Addendum: Event-flow spec for every core user action (bind/insert/convert/swap)

(This is the “don’t let engineers improvise UX” contract. Fully deterministic, bus-first, no edge-drag.)

I’m going to specify exact UI gestures → emitted typed events → store transactions → derived layout updates → visual feedback.
Assume your typed event system + transaction builder + history tree is already in place.

⸻

0) Global conventions

0.1 Events vs ops vs transactions
	•	UI emits events (pure intent)
	•	Controller translates to transactions (one atomic change)
	•	Store applies ops (undoable)
	•	Layout recomputes from graph data (pure)
	•	Renderer animates position changes (FLIP)

0.2 Deterministic “instant feedback”

Every action must:
	1.	visually acknowledge within 16ms (highlight, spinner, toast)
	2.	commit in a single transaction (even if it contains multiple ops)
	3.	never leave the graph in a partially-applied state

0.3 Single place for policy enforcement

All policy rules (“direct must be short”, “signal→field needs lift”, “no implicit adapters”) live in BindingController (one module), not scattered.

⸻

1) Action: Bind an unbound input port (primary flow)

1.1 UI gesture

User clicks a glowing unbound input port.

1.2 Event

ui.port.clicked({ portRef, direction:'input' })

1.3 UI response (immediate)
	•	Port gets “active” state
	•	TypedChooserPopover opens anchored to port

1.4 Chooser options shown (must always include)
	1.	Inline literal (if allowed)
	2.	Bind to Bus…
	3.	Insert Compatible Block…
	4.	Use Existing Output… (direct only if local-eligible)

1.5 Hover preview event (optional but structured)

ui.chooser.preview({ portRef, candidateId })

Controller runs a simulation (no ops). Returns:
	•	wouldAddBlocksCount
	•	wouldBindBusId?
	•	wouldCreateBus? (name/type)
	•	expectedTypeChain (if adapters/lenses)
	•	“direct eligible?” boolean

UI shows preview panel.

1.6 Selection event

ui.chooser.selected({ portRef, candidateId })

1.7 Controller decision tree

The candidate resolves to one of:
	•	INLINE_LITERAL
	•	BUS_BIND
	•	INSERT_BLOCK_AND_BIND (usually bus or direct)
	•	DIRECT_BIND_EXISTING_OUTPUT

1.7.1 Transaction (single atomic commit)

tx.begin("Bind input port")

Then apply ops based on outcome (see sections 2–5).

tx.commit()

1.8 Post-commit behavior
	•	Layout recompute
	•	If any direct edge became too long, controller auto-converts to bus inside the same transaction (never after)
	•	Board animates to new positions
	•	Inspector focuses the consumer block
	•	Port chip now shows binding

⸻

2) Outcome A: Inline literal binding

2.1 Applicable when

Port type supports a JSON-serializable literal (number, vec2, color, etc.)

2.2 Ops (within transaction)
	•	op.port.setInlineLiteral({ portRef, value, editorKind })

2.3 UI
	•	Port shows inline widget (slider/field/etc.)
	•	Binding chip not shown (because it’s a literal)

2.4 Undo behavior

Undo restores unbound port.

⸻

3) Outcome B: Bind input to an existing bus (with lenses)

3.1 Applicable when

Bus world/domain compatible OR convertible via lens chain.

3.2 Event path

User picks “Bind to Bus…” then chooses a bus.

3.3 Controller builds binding plan

plan = computeBestLensChain(bus.typeDesc -> port.typeDesc)

Constraints:
	•	No implicit conversion
	•	If conversion required, chain must be explicit steps
	•	If any step is “heavy”, require user confirmation in UI before commit

3.4 Ops

In one transaction:
	1.	op.listener.addOrReplace({ portRef, busId, lensChain })
	2.	op.port.clearInlineLiteral({ portRef }) (if any)
	3.	op.directBinding.removeIfExists({ to: portRef }) (if any direct existed)

3.5 UI
	•	Port shows chip: ⟵ busName · Lens1 · Lens2
	•	BusBoard counts update
	•	Focus highlight available on bus click

⸻

4) Outcome C: Create a new bus during binding (hybrid workflow)

4.1 Trigger cases
	•	No existing compatible bus is chosen
	•	User selects “Create New Bus” in bus picker
	•	OR system policy forces bus because direct would be long

4.2 Event

ui.bus.createRequested({ suggestedName, typeDesc, combineModeSuggestion, silentDefault })

4.3 Ops

Within a single transaction that also performs the binding:
	1.	op.bus.create({ busId, name, typeDesc, combineMode, silentValue })
	2.	op.listener.addOrReplace({ portRef, busId, lensChain })

Optional (if converting from direct):
3) op.publisher.addOrReplace({ fromPortRef, busId, adapterChain? }) (if your model needs it)
4) op.directBinding.remove(...)

4.4 UI
	•	New bus appears at top of BusBoard (or in sorted position)
	•	Bus row flashes “created”
	•	Port chip points to it

⸻

5) Outcome D: Insert a new block to satisfy the port

This is the “grow the graph by need” flow.

5.1 Event

ui.block.insertRequested({ consumerPortRef, blockTypeId })

5.2 Controller decides binding style

Default:
	•	If the inserted block is an operator/local helper: direct
	•	If it’s a modulation source or cross-cutting signal: bus
	•	If direct would exceed Lmax after placement: bus (forced)

5.3 Ops (always include stable IDs)
	1.	op.block.add({ blockId, type, initialParams })
	2.	op.layout.seedPlacementHint({ blockId, near: consumerBlockId }) (optional; not persisted, just a hint)
	3.	Bind inserted block output → consumer input using either:
	•	op.directBinding.add({ from, to }) OR
	•	op.bus.create + op.publisher/add + op.listener/add

No partial states: inserted block must be connected immediately or the transaction fails.

5.4 UI
	•	Block appears adjacent per layout rules
	•	If direct: short connector drawn if eligible
	•	If bus: chips shown; no long edge

⸻

6) Action: Convert Direct → Bus (explicit user action)

6.1 Gesture

User clicks direct chip from: BlockName and chooses “Convert to Bus…”

6.2 Event

ui.binding.convertDirectToBus({ directEdgeId, preferredBusId? })

6.3 Controller logic
	•	Identify fromPortRef and toPortRef
	•	Propose bus name:
	•	derived from destination port semantics (radius → radius, progress → phaseA)
	•	If user selected an existing bus, use it; else create new

6.4 Ops

Single transaction:
	1.	If creating:
	•	op.bus.create(...)
	2.	op.publisher.addOrReplace({ from: fromPortRef, busId })
	3.	op.listener.addOrReplace({ portRef: toPortRef, busId, lensChain: [] })
	4.	op.directBinding.remove({ directEdgeId })

6.5 UI
	•	direct connector disappears
	•	binding chips appear
	•	bus board updates counts

⸻

7) Action: Convert Bus → Direct (rare; allowed only under strict conditions)

7.1 Preconditions (must all hold)
	•	exactly one publisher for that bus within this graph
	•	exactly one subscriber (this port)
	•	combineMode == passthrough-compatible (last)
	•	no lens chain OR lens chain can be migrated into operator blocks automatically
	•	layout can place blocks within Lmax

If any precondition fails, UI does not show this option.

7.2 Event

ui.binding.convertBusToDirect({ portRef, busId })

7.3 Ops

Single transaction:
	1.	op.directBinding.add({ from: publisherPortRef, to: portRef })
	2.	op.listener.remove({ portRef })
	3.	Optionally op.publisher.remove({ publisherPortRef, busId })
	4.	If bus now unused: either keep (preferred) or prompt delete

7.4 UI
	•	direct chip appears
	•	short connector appears if eligible; else conversion is rejected by controller

⸻

8) Action: Swap a block implementation (one of your core “fun” affordances)

8.1 Gesture

In Inspector: “Swap…” list.

8.2 Event

ui.block.swapRequested({ blockId, newTypeId })

8.3 Controller responsibilities
	•	Preserve:
	•	existing bindings wherever type-compatible
	•	bus bindings by port semantic mapping when possible
	•	If a port no longer exists:
	•	detach binding but keep it as a “dangling binding” record (see 11)
	•	If types differ but convertible:
	•	attach lens chain automatically (but must be visible)

8.4 Ops

Single transaction:
	1.	op.block.setType({ blockId, newTypeId })
	2.	op.block.remapPorts({ blockId, mapping })
	3.	For each affected port:
	•	op.listener.update(...) or op.directBinding.update(...) or detach

8.5 UI
	•	block label changes
	•	chips update
	•	if any detaches occurred: show a toast “3 bindings parked” with “Review” button

⸻

9) Action: Change a lens chain on a bus subscription

9.1 Gesture

Click bus binding chip → Lens Editor → add/remove/reorder steps.

9.2 Event

ui.lensChain.changed({ portRef, busId, newChain })

9.3 Ops
	•	op.listener.setLensChain({ portRef, busId, lensChain: newChain })

9.4 Enforcement
	•	Validate type evolution busType -> ... -> portType
	•	Reject invalid chains at edit-time, not compile-time
	•	Heavy steps require explicit per-binding “accept” flag stored on listener

⸻

10) Action: Auto-forced conversion (policy enforcement)

This is the critical anti-spaghetti mechanism.

10.1 When it triggers

After any transaction that creates or changes a direct binding, controller must re-evaluate:
	•	Will the layout produce connector length > Lmax?
	•	Will the binding cross clusters illegally?

10.2 How it happens

Not as a second transaction. It must occur inside the same commit.

Mechanism:
	•	Controller precomputes a “prospective layout” (cheap estimate or full layout call)
	•	If direct invalid:
	•	replace direct binding ops with bus binding ops before commit

Remember: users should never see a direct binding “blink” into existence then vanish.

⸻

11) “Parked bindings” (critical for no-jank and swaps)

When a binding can’t be preserved (swap/delete/port removal), do not drop it silently.

11.1 Data

interface ParkedBinding {
  id: string;
  originalPortSemantic: string;
  typeDesc: TypeDesc;
  kind: 'bus'|'direct'|'literal';
  payload: ...
  createdAtTxId: string;
}

11.2 UI
	•	Block shows a small badge “Parked: 2”
	•	Inspector lists parked bindings with one-click reattach suggestions

This is how experimentation stays fearless.

⸻

12) Deterministic focus + scrolling rules

After any mutation:
	•	If action originated from a port:
	•	focus the consumer block
	•	ensure it is in view (smooth scroll/pan)
	•	If action originated from BusBoard:
	•	focus that bus
	•	highlight publishers/subscribers

Never “jump” the camera unless explicitly requested (Zoom to fit / Jump to).

⸻

13) Required controller modules (so engineers implement cleanly)

To avoid scattered logic, mandate these modules:
	1.	LayoutEngine.compute(graph, uiState) -> LayoutResult
	2.	BindingPlanner.planBusBinding(busType, portType) -> lensChain
	3.	PolicyEngine.canDirectBind(from, to, prospectiveLayout) -> boolean
	4.	MutationController.dispatch(event) -> Transaction
	5.	PreviewSimulator.simulate(event) -> PreviewResult

No other code path may mutate graph structure.

⸻

If you want, next we can formalize the typed events list and their payloads (the canonical event taxonomy), so UI and controller share a stable contract.