# Clarifying Questions (Contradictions / Ambiguities)

1) Is `CycleTimeRoot` a valid TimeRoot type? `02.1-TimeConsole-UI.md` says “There is no CycleTimeRoot,” while `07-UI-Spec.md`, `09-Blocks.md`, `10-Golden-Patch.md`, `05-Compilation.md`, and `08-Export.md` all reference Cycle/Cyclic/CycleTimeRoot.

2) What are the authoritative `TimeModel` variants? `00-Vision.md` and `01-Core-Concepts.md` define only `{ kind: 'finite' | 'infinite' }`, `02-Time-Architecture.md` defines finite/infinite with `windowMs`, `05-Compilation.md` and `10-Golden-Patch.md` include `cyclic`, and `08-Export.md` expects `cyclic` in `ExportTimePlan`.

3) Is `TimeModel` determined solely by TimeRoot, or can other graph properties (e.g., feedback loops) force `infinite`? `02-Time-Architecture.md` says topology is defined solely by TimeRoot, while `05-Compilation.md` infers `infinite` from feedback loops.

4) Should the finite TimeRoot allow view-looping modes in the Time Console? `02.1-TimeConsole-UI.md` lists Once/Loop/Ping-pong for finite view policy, while `07-UI-Spec.md` says “No ‘Loop View’ option - if user wants looping, use CycleTimeRoot.”

5) Are global rails always present and distinct from buses, or are they just reserved buses? `02-Time-Architecture.md` and `02.2-Time-and-Rails.md` describe fixed Global Rails with optional bus mirroring, while `03-Buses.md` treats phaseA/pulse/energy/progress as canonical buses and does not mention mirroring.

6) Are `pulseA`/`pulseB` distinct rails, or is there a single `pulse` bus? `02-Time-Architecture.md` and `02.2-Time-and-Rails.md` list `pulseA`/`pulseB` rails, while `03-Buses.md` and `10-Golden-Patch.md` use a single `pulse` bus.

7) Is `palette` a canonical bus or only a rail? `02-Time-Architecture.md` and `02.2-Time-and-Rails.md` include a `palette` rail, `10-Golden-Patch.md` lists `palette` as canonical bus, while `03-Buses.md` does not list `palette` in the canonical bus set.

8) Should TimeRoot auto-publish phase/pulse/energy/progress to buses, or should only the Modulation Rack drive rails and optionally mirror to buses? `02-Time-Architecture.md` says TimeRoot publishes only reserved `time`, `03-Buses.md` and `09-Blocks.md` say TimeRoot auto-publishes phase/pulse/energy/progress (some provisional).

9) Is the reserved bus `time` always present and only published by TimeRoot? This is specified in `02-Time-Architecture.md` and `02.2-Time-and-Rails.md`, but not reflected in `03-Buses.md`.

10) Is `InfiniteTimeRoot` allowed to have a `periodMs` input and ambient `phase/pulse/energy` outputs? `02-Time-Architecture.md` says no required inputs and publishes only `time`, while `09-Blocks.md` adds `periodMs` and ambient phase/pulse/energy (provisional).

11) Are Cycle A/B lanes part of Time Console overlay only, or do they correspond to concrete block types? `02.1-TimeConsole-UI.md` and `02.2-Time-and-Rails.md` treat them as hidden operators, while `09-Blocks.md` emphasizes CycleTimeRoot as a block and `10-Golden-Patch.md` uses CycleTimeRoot directly.

12) Are rail drive policies Normalled/Patched/Mixed intended to allow “rail driven by bus” (source selector) as mandatory UI? `02.3-Rails-More.md` says this is required, while `02-Time-Architecture.md` and `02.2-Time-and-Rails.md` discuss optional bus mirroring without a mandatory bus source selector.

13) Are rail reads frame-latched (t-1) or same-frame? `02.3-Rails-More.md` presents two options and recommends frame-latched; no other doc locks this down.

14) Are overlay cycles editable only in Time Console, or can they be materialized into blocks? `02-Time-Architecture.md` and `02.99-Time-DEFERRED-WORK.md` mention materialization, but the UI spec does not explicitly include a control path.

15) Should Time Console scrubbing exist now or be deferred? `02.1-TimeConsole-UI.md` says scrubbing has been DEFERRED, while `02-Time-Architecture.md` and `07-UI-Spec.md` specify scrubbing behavior in all modes.

16) Are bus combine rules for rails editable only in the Time Console, and if so are they separate from bus combine rules? This is stated in `02-Time-Architecture.md`/`02.2-Time-and-Rails.md`, but `03-Buses.md` implies bus combine is the only combine system.

17) Does UI mode include CYCLE as a first-class TimeModel kind, or is CYCLE just a view mode for finite? `07-UI-Spec.md` includes a CYCLE badge and TimeRoot picker option; `02.1-TimeConsole-UI.md` says only Finite/Infinite TimeRoots exist.

18) For export: if the system ends up with no CycleTimeRoot but only derived cycles, how does cyclic export work? `08-Export.md` is written around CycleTimeRoot (phase override), while `02-Time-Architecture.md` says cycles are derived operators.
