# Time Architecture — Quick Reference

**Note:** This is quick reference. Authoritative spec: `design-docs/final-Synthesized-v2/topics/03-Time-Architecture.md`

---

## Fundamental Principle

**There is exactly ONE time system. The patch defines time topology. The player does not.**

The player never decides: Duration, Looping, Ping-pong, Infinity.
The player: Hosts, Observes, Controls rate, Controls freeze/run.

---

## TimeRoot Types

| Type | Description | Output |
|------|-------------|--------|
| `FiniteTimeRoot` | Finite performance with known duration | `systemTime`, `progress` |
| `InfiniteTimeRoot` | Runs unbounded, no privileged cycle | `systemTime` |



### Constraints
- Exactly one TimeRoot per patch (compile error if 0 or >1)
- TimeRoot cannot have upstream dependencies
- TimeRoot cannot exist inside composite definitions
- TimeRoot publishes ONLY the reserved `time` bus

---

## TimeModel

```typescript
type TimeModel =
  | { kind: 'finite', durationMs: number }
  | { kind: 'infinite' }
```

**Note:** No `cyclic` variant. TimeModel is determined ONLY by TimeRoot, never by graph properties.

---

## Global Rails

Canonical set (reserved buses):
- `time` : Signal<time> — monotonic, published only by TimeRoot
- `phaseA` : Signal<number> [0,1) — primary phase modulation
- `phaseB` : Signal<number> [0,1) — secondary phase modulation
- `pulse` : Event<trigger> — discrete time boundary events
- `energy` : Signal<number> [0,1] — intensity/activity level
- `palette` : Signal<number> [0,1] — palette position

Rails are produced by the **Time Console** (Modulation Rack), not by TimeRoot.

### Rail Drive Policy
- **Normalled**: Modulation Rack drives the rail (default)
- **Patched**: Modulation Rack disconnected; only user publishers
- **Mixed**: Both rack and user publishers; combine rule applies

### Rail Semantics
- **Frame-latched**: Rail reads observe previous frame snapshot
- Updates become visible on the next frame
- Required for determinism, cacheability, and stable debugging

---

## Scrubbing

**Scrubbing is REQUIRED** (not deferred).

| TimeModel | Scrub Behavior |
|-----------|----------------|
| Finite | Sets absolute time `t` in [0..durationMs] |
| Infinite | Offsets view window origin |

**Scrubbing never resets state.** Only adjusts view transforms.

---

## Player Playback Policy

For **finite** patches, view-time mapping modes:
- `once`: play from 0 to duration without looping
- `loop`: repeat playback continuously
- `pingpong`: play forward then backward repeatedly

These affect only view-time (`tView`), never the underlying monotonic time `t`.

For **infinite** patches: monotonic sliding window, no looping or wrapping.
