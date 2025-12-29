# Oscilla Animator - Golden Patch

**The reference implementation for testing architectural correctness.**

See `design-docs/3-Synthesized/10-Golden-Patch.md` for full specification.

## "Breathing Constellation" Summary


- GridDomain (20x20)
- Buses: phaseA, pulse, energy, palette
- Per-element phase offset via StableIdHash
- Breathing radius from energy signal
- Position drift from slow phaseB

## Acceptance Criteria

1. Phase ring animating, pulse indicator ticking
2. No clamping/wrapping bugs in player time
3. Param tweaks apply without jank
4. Period changes scheduled at pulse boundary
5. Same seed = identical motion every reload
