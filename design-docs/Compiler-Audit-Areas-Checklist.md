# Compiler Audit Areas Checklist

- [x] IR compiler pipeline (passes 1–8, type graph, time topology, lowering, linking)
- [ ] IR schedule builder and runtime step execution (timeDerive, signalEval, materialize, renderAssemble)
- [ ] Bus system (contracts, reserved buses, bus lowering, combine semantics)
- [x] Block lowering registry (IR block coverage, legacy-only blockers, missing opcodes)
- [ ] Type system and conversions (TypeDesc, adapters/lenses, type conversion paths)
- [ ] Field runtime (FieldExpr, Materializer, kernels, determinism constraints)
- [ ] Signal runtime (SigExpr table extraction, evaluator, stateful ops)
- [ ] Render pipeline (RenderIR, Instances2D/Paths2D passes, Canvas renderer)
- [ ] Time architecture (TimeRoot → TimeModel invariants, player transport)
- [ ] Default source system (defaultSourceStore, resolution, compile/linking)
- [ ] Debug/inspection tooling (DebugDisplay, debug probes, debug index)
- [ ] Export pipeline (phase-driven sampling, determinism) if present

