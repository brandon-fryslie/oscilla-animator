# Oscilla Animator - Non-Negotiable Invariants

## Runtime Purity
1. **No `Math.random()` at runtime** - Breaks scrubbing/replay
2. **All randomness seeded, evaluated at compile-time**
3. **Animations are time-indexed programs**

## Time Invariants
4. **Player time is unbounded** - Never wrap t
5. **TimeRoot defines topology** - Player only observes
6. **Scrubbing never resets state** - Only adjusts view transforms

## Field Invariants
7. **Fields are lazy** - Evaluate only at render sinks
8. **Domain identity is stable** - IDs survive edits
9. **No bulk re-evaluation on wrap** - Looping is topological

## Compilation Invariants
10. **World mismatches are compile errors** - Not runtime
11. **Domain mismatches are compile errors** - Not runtime
12. **Exactly one TimeRoot per patch** - Compile error otherwise

---

## Common Pitfalls

### DO NOT
- Add `loopMode` to player (topology is in TimeRoot)
- Use `Math.random()` anywhere in runtime code
- Materialize fields before render sinks
- Reset state on scrub
- Assume a maximum time value

### DO
- Consult spec docs before architectural changes
- Run `just check` before committing
- Add tests for new block compilers
- Preserve determinism (same seed = same output)
- Update spec docs if implementation requires changes
