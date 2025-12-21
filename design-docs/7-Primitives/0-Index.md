# Primitives & Kernel Architecture

> **Status**: Canonical
> **Created**: 2024-12-21

This directory defines the **closed primitive set** for Oscilla and the enforcement mechanisms that prevent expansion.

---

## Documents

| Document | Purpose |
|----------|---------|
| [1-Primitive-Closure.md](./1-Primitive-Closure.md) | The closure rule, canonical primitive list, and what is NOT primitive |
| [2-Type-System-3D-Safe.md](./2-Type-System-3D-Safe.md) | Type additions ensuring 3D compatibility |
| [3-Registry-Gating.md](./3-Registry-Gating.md) | Enforcement mechanisms (code, CI, review) |

---

## Quick Reference

### Kernel Capabilities

| Capability | Authority | Primitives |
|------------|-----------|------------|
| `time` | Time topology | FiniteTimeRoot, CycleTimeRoot, InfiniteTimeRoot |
| `identity` | Element creation | DomainN, SVGSampleDomain |
| `state` | Frame-to-frame memory | IntegrateBlock, HistoryBlock |
| `render` | RenderTree emission | RenderInstances, RenderStrokes*, RenderProgramStack* |
| `io` | External assets | SVGSampleDomain, TextSource*, ImageSource* |
| `pure` | No special authority | All other blocks (unlimited) |

*\* = future slot, not yet implemented*

### The Rule

> **A block is kernel primitive only if it implements a kernel capability.**
>
> **No new primitives may be added unless a new capability is added.**
>
> **Adding a new capability requires architectural decision and maintainer approval.**

### Block Classification

```
┌─────────────────────────────────────────────────────────────┐
│                      ALL BLOCKS                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │           KERNEL PRIMITIVES (~12)                    │    │
│  │  capability: time | identity | state | render | io   │    │
│  │  FROZEN - no additions without new capability        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           OPERATOR PRIMITIVES (many)                 │    │
│  │  capability: pure                                    │    │
│  │  Math, transforms, pure functions                    │    │
│  │  OPEN - new operators welcome                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           COMPOSITES (unlimited)                     │    │
│  │  form: composite                                     │    │
│  │  Built from primitives                               │    │
│  │  OPEN - new composites welcome                       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Domain IDs are opaque | Prevents ID scheme proliferation, keeps identity clean |
| GridDomain is composite | Decomposes to DomainN + PositionMapGrid |
| Only 2 state primitives | Integrate + History form complete orthogonal basis |
| Bus combine is compiler-internal | Buses are channels, not patch nodes |
| Filtering is masking, not Domain→Domain | Preserves stable identity |
| 3D types added now | Prevents 2D lock-in even if unused |

---

## Enforcement Summary

1. **Type system**: `capability` field on BlockDefinition
2. **Allowlist**: `KERNEL_PRIMITIVES` in single locked file
3. **Runtime validation**: `validateBlockDefinition()` on registration
4. **Compile-time validation**: `validatePureBlockOutput()` on compilation
5. **CI check**: Script rejects unauthorized primitives
6. **PR review**: Checklist for block changes
