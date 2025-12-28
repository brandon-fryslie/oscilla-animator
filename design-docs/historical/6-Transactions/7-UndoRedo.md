Undo/Redo UI Model for a Persistent History Tree

This is the UX/UI spec for undo/redo when history never truncates and every new edit after undo creates a new branch. The goal is:
	•	keep the simplicity of “Cmd-Z / Cmd-Shift-Z” for normal use
	•	expose branching in a way that feels creative (“try variations”) not “version control”
	•	make it impossible to “lose work”
	•	make navigation fast and predictable
	•	integrate cleanly with compilation/no-jank (checkout → compile → swap)

I’ll specify:
	1.	Mental model and user promises
	2.	Keyboard behavior (exact semantics)
	3.	Branch selection behavior (“redo with choices”)
	4.	History panel UI (layout, interaction)
	5.	Checkpoints, bookmarks, and “takes”
	6.	Preview + no-jank rules during checkout
	7.	Edge cases and diagnostics
	8.	Data needs from HistoryStore

⸻

1) Mental model (what the UI must communicate)

The promise
	•	Undo never deletes anything.
	•	Redo is “go forward,” but if you forked, there are multiple futures.
	•	You can always return to any previous state.

The metaphors (choose one consistent metaphor)

You want something artist-friendly, not “git”.

Best fit here: “Timeline of takes”
	•	Each commit is a “take” (a moment you can return to).
	•	Undo moves back along the take line.
	•	New edits create a new take branch (like alternate takes).

Do not call it “branch” in the UI. Call it:
	•	“Variation”
	•	“Alternate”
	•	“Fork”
	•	“Take”

I recommend Variation.

⸻

2) Keyboard behavior (exact semantics)

2.1 Undo: Cmd/Ctrl+Z

Always move to the parent revision:
	•	If head.parent exists: checkout parent.
	•	If at root: no-op (optional subtle shake or disabled indicator).

This is identical to traditional apps. No surprises.

2.2 Redo: Cmd/Ctrl+Shift+Z

Redo means “advance to a child revision”:

If there is exactly one child:
	•	checkout that child (standard redo behavior)

If there are multiple children:
	•	checkout the “preferred child” (defined below) and
	•	show a small chooser (non-modal) to pick a different child.

Key principle: redo must remain one-keystroke-fast, but must not hide the existence of other futures.

⸻

3) Preferred-child rule (crucial)

When multiple children exist, you need a deterministic rule so redo does something consistent.

Preferred child = “last visited future”

Maintain per-node metadata:
	•	preferredChildId?: RevId

Whenever the user checks out one of the children of node X, set:
	•	X.preferredChildId = childRevId

Then redo at X goes to:
	•	preferredChildId if it exists
	•	else the most recently created child (by timestamp)
	•	else stable sort by revId (fallback)

This makes redo feel natural:
	•	“redo takes me back where I just was”

⸻

4) Branch selection UI (“Redo with choices”)

When multiple children exist and user presses redo:

Show a lightweight “Redo choices” popover near transport or top bar:
	•	Title: “Choose a variation”
	•	List of children (max 6 visible; scroll if more)
	•	Each item shows:
	•	label (e.g. “Change Radius”)
	•	timestamp (relative)
	•	small badge if bookmarked
	•	optionally a tiny thumbnail (later)

Interaction:
	•	pressing redo again cycles through options
	•	arrow keys navigate list
	•	enter selects
	•	escape dismisses

This keeps keyboard-only flow excellent.

Also: allow a mouse path:
	•	click-and-hold redo button reveals same menu

⸻

5) The History Panel (primary UI)

You need a dedicated History Panel that does not intimidate.

5.1 Placement
	•	Right sidebar, near Bus Board / Inspector area
	•	Collapsible
	•	Icon: “🕘” (history) but you can stylize

5.2 Default mode: “Recent Takes”

Show a vertical list (like a DAW clip list), NOT a graph.
	•	Shows last ~30 revisions along the currently checked-out path.
	•	Indent items that have siblings (variations exist).

Example list row:
	•	● (current)
	•	label
	•	small “+2” badge if this node has 2 variations branching off
	•	bookmark star
	•	optional compile status dot (green/red)

Clicking a row checks it out.

5.3 Expand variations inline

If a node has children:
	•	clicking the “+N” badge expands a small subtree below it
	•	children appear as indented items
	•	selecting a child checks it out and sets preferredChild

This exposes branching only when needed.

5.4 Secondary mode: “Map”

A graph view is useful but can be scary.

So make it a toggle:
	•	“List” (default)
	•	“Map” (advanced)

Map view shows:
	•	nodes as dots
	•	edges as lines
	•	current path highlighted
	•	zoom/pan
	•	click any node to checkout

But most users live in List mode.

⸻

6) Checkpoints / Bookmarks / Milestones (critical for creativity)

A history tree becomes magical when you can mark points.

6.1 Bookmark (star)

Every revision can be bookmarked.

UI:
	•	star icon on row
	•	bookmarked rows float to a “Pinned” section at top of History panel

6.2 Milestone (named checkpoint)

Add “Save Take…” command:
	•	prompts for a name
	•	creates a new revision node with label “Milestone: ”
	•	OR attaches name to current revId (prefer attaching metadata, not creating new mutation)
	•	appears in pinned list

Milestones are not patch mutations, but project metadata. Treat them as HistoryMetaUpdated if you want.

6.3 “New Variation From Here”

On any history row:
	•	context action: “Start new variation”
This simply checks out that node and arms the UI to expect new edits from there.

This is actually just checkout; but the label helps people understand.

⸻

7) Checkout UX + no-jank rules

Checkout triggers compile and program swap. You must prevent “history scrubbing feels glitchy.”

7.1 Immediate UI feedback

On checkout:
	•	highlight selected history row immediately (<= 16ms)
	•	show “Compiling…” state next to it

7.2 Render continuity policy

While compile is in flight:
	•	keep last program running
	•	optionally freeze on the last rendered frame if switching time topology

When compile succeeds:
	•	swap program using your chosen strategy (immediate / onPulse / onFreeze)

7.3 Failure behavior

If compile fails for that revision:
	•	keep last good program running
	•	show failure badge on that revision row
	•	keep the head pointer on that revision (because it’s a real state), but show “Runtime not updated”

This is honest: history includes broken states too.

⸻

8) Undo/Redo buttons (transport-level UI)

Even if you have keyboard, buttons matter.

8.1 Undo button
	•	always enabled if parent exists
	•	long-press reveals “jump back” list (last 10)

8.2 Redo button
	•	if single child, acts normally
	•	if multiple children, shows a tiny split indicator
	•	click performs preferredChild
	•	click-and-hold opens variation chooser

This subtly teaches the branching model.

⸻

9) Required data from HistoryStore (so UI is trivial)

The UI needs these queries fast:
	•	getHeadRevId()
	•	getParent(revId)
	•	getChildren(revId) (ordered)
	•	getPreferredChild(revId)
	•	setPreferredChild(revId, childId)
	•	getNode(revId) (label, timestamp, origin, stats, snapshotRef, bookmarked)
	•	getPathToRoot(revId) (for list view)
	•	checkout(revId) (triggers materialization + compile)
	•	bookmark(revId, on/off)
	•	renameMilestone(revId, name) (or attach metadata)

Also helpful:
	•	getRecentRevs(limit) along the active path
	•	getSiblings(revId) (children of parent excluding current)

⸻

10) Edge cases (must be explicitly handled)

10.1 Head at root

Undo disabled.

10.2 Redo when multiple children and no preferredChild

Use most recent child.

10.3 Jumping between branches

PreferredChild pointers update automatically so redo becomes “go back where you were.”

10.4 Gesture active while undo pressed

Policy:
	•	finalize gesture first (commit for moves/params; cancel for text unless blurred)
	•	then perform undo checkout

10.5 Remote/multi-client (future)

If head changes remotely:
	•	show toast “Updated to  by ”
	•	if you’re mid-gesture: you must block or fork (but that’s for the multi-client spec)

⸻

Summary: the UX contract
	•	Undo is always “go to parent.”
	•	Redo is “go to preferred child,” with chooser when multiple futures exist.
	•	History is presented as a list of takes with expandable variations, not a scary graph.
	•	Bookmarks and milestones make the tree creatively useful.
	•	Checkout is immediate visually, compile happens in background, runtime swaps only on success.

If you want, next I can spec the History Panel visual layout down to row anatomy, icons, and exact interactions (hover menus, context actions, keyboard navigation), suitable for a designer to mock up directly.