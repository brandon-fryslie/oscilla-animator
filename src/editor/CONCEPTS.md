# Animation Editor Concepts

This document explains the ideas behind the animation editor for someone who wants to understand *why* it works the way it does, not just *how* to use it.

## The Big Picture

Traditional animation tools work like video editing: you have a timeline, keyframes, and you manually specify what happens at each moment. This works, but it doesn't scale well to complex procedural animations where hundreds of elements need to move in coordinated but varied ways.

This editor takes a different approach: **declarative animation programming**. Instead of specifying every frame, you describe the *rules* that generate the animation. The computer figures out what to draw each frame based on those rules.

Think of it like the difference between manually placing every brick in a wall versus describing "a brick pattern that repeats".

## The Data Flow Model

The editor uses a **node graph** (also called a "patch bay" from analog synthesizer terminology). Data flows from left to right through connected blocks:

```
[Source Block] ─── data ───> [Processing Block] ─── data ───> [Output Block]
```

Each block takes some inputs, does something with them, and produces outputs. By connecting blocks together, you build up complex behavior from simple pieces.

This is fundamentally different from imperative programming where you write step-by-step instructions. Here, you're describing *relationships* between data, and the system figures out the execution order.

## Core Abstractions

### Scenes and Targets

A **Scene** is the raw geometry you want to animate. Right now, this is SVG paths (the logo or text shapes). A scene contains multiple paths, each with its own curves and points.

**Targets** are the individual elements that will be animated. When you "sample" a scene, you extract points along the paths. Each point becomes an independent animated element.

Why this separation? Because the same scene can be animated many different ways. You might want 50 particles per path, or 500, or just one. The scene is the *what*, targets are the *how many*.

### Fields: Per-Element Data

Here's a key insight: interesting animations come from *variation*. If every particle moves the same way, it looks robotic. If each one is slightly different, it looks organic.

A **Field** is a value that varies per element. Instead of saying "all particles start 200 pixels away", you say "each particle starts somewhere between 150-250 pixels away, with randomness".

In code terms, a Field is roughly:
```
Field<T> = (elementIndex, totalElements) => T
```

The editor has Field blocks for common patterns:
- **Radial Origin**: Positions spread in a circle
- **Linear Stagger**: Delays that increase element-by-element
- **Noise Field**: Random variations

You can combine Fields mathematically (add, multiply, etc.) to create complex distributions.

### Signals: Time-Varying Values

A **Signal** is a value that changes over time. While a Field varies across elements (spatial variation), a Signal varies across time (temporal variation).

Signals are used for things like:
- Global animation progress (0 to 1 over the animation duration)
- Oscillating values (sine waves)
- Phase machine output (which phase we're in)

### Phase Machines: Animation Structure

Most animations have structure: things appear, do something, then disappear. The **Phase Machine** formalizes this as phases:

1. **Entrance**: Elements animate from start positions to final positions
2. **Hold**: Elements stay in place (or do subtle motion)
3. **Exit**: Elements animate out

Each phase has a duration. The phase machine outputs which phase we're in and how far through it we are. This drives the animation timing.

Why not just use raw time? Because phases let you think about animation *structure* independently from timing. You can adjust how long the entrance takes without rewriting the animation logic.

### Programs: Compiled Animations

A **Program** is what you get when all the pieces come together. It's a function that takes time and produces a render tree (what to draw).

```
Program = (time) => RenderTree
```

The editor "compiles" your block graph into a program. This compilation:
1. Type-checks all connections
2. Resolves the data flow order
3. Produces an optimized function

When you hit play, the program runs 60 times per second to produce each frame.

### Render Trees: What Gets Drawn

The **RenderTree** is a declarative description of what to draw. It's a tree of nodes:

- **Groups**: Collections of children
- **Shapes**: Actual geometry (paths, circles, rectangles)
- **Effects**: Transformations applied to children (opacity, transforms, filters)

Why a tree structure? Because it maps naturally to SVG (which is also a tree), makes hit-testing and culling efficient, and lets effects compose cleanly.

## The Type System

The editor enforces a simple type system on connections. You can't connect a `Field<Point>` output to a `Signal<float>` input because they're fundamentally different things.

Common types:
- `Scene`: Collection of paths
- `SceneTargets`: Points extracted from paths
- `Field<T>`: Per-element value of type T
- `Signal<T>`: Time-varying value of type T
- `Program`: Compiled animation function
- `RenderTree`: What to draw

This catches mistakes early. If ports can't connect, you know immediately rather than getting confusing runtime errors.

## Patch Bay View

As graphs get complex, they become hard to read. The Patch Bay view is a visual projection that groups blocks by role to keep data flow
readable. The graph remains the source of truth; the view is there to help you reason about structure.

## Compilation Pipeline

When you change the graph, here's what happens:

1. **Topological sort**: Figure out which blocks depend on which
2. **Type checking**: Verify all connections are valid
3. **Evaluation**: Run each block's compiler in order
4. **Program assembly**: Combine results into a runnable program

This happens automatically (with debouncing to avoid thrashing). The preview updates within ~300ms of any change.

Errors show up as decorations on the blocks that caused them. The log window shows details.

## Design Philosophy

A few principles shaped this design:

**Declarative over imperative**: You describe what you want, not how to compute it. This makes animations easier to tweak and explore.

**Composition over configuration**: Instead of one mega-block with 50 parameters, you have small blocks that combine. This is more flexible and more learnable.

**Types prevent errors**: The type system catches mistakes at edit time. If ports connect, the animation will run.

**Progressive disclosure**: Simple things are simple. Advanced workflows are still available without forcing complexity up front.

## Mental Model Summary

1. **Data flows left to right** through connected blocks
2. **Fields** give each element its own parameters
3. **Signals** give things that change over time
4. **Phase machines** structure the animation timing
5. **Programs** are the compiled result that runs each frame
6. **The Patch Bay** organizes blocks by their role

The goal: describe the *rules* of your animation, not every frame. The rules + randomness + time = infinite unique animations.
