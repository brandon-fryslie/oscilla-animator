# Definition of Done: Complete Legacy Removal from pass6-block-lowering.ts

**Generated**: 2026-01-04 (REVISED)
**Plan**: PLAN-2026-01-04-REVISED.md

---

## Sprint Goal

Remove ALL legacy and fallback code from pass6-block-lowering.ts with ZERO exceptions.

---

## Acceptance Criteria

### Work Item 1: Migrate 22 Blocks to outputsById

**Block migration complete:**
- [ ] DomainN uses outputsById
- [ ] FieldAddVec2 uses outputsById
- [ ] FieldConstColor uses outputsById
- [ ] FieldConstNumber uses outputsById
- [ ] FieldFromSignalBroadcast uses outputsById
- [ ] FieldHash01ById uses outputsById
- [ ] FieldMapNumber uses outputsById
- [ ] FieldReduce uses outputsById
- [ ] FieldZipNumber uses outputsById
- [ ] FieldZipSignal uses outputsById
- [ ] PathConst uses outputsById
- [ ] PositionMapCircle uses outputsById
- [ ] PositionMapGrid uses outputsById
- [ ] PositionMapLine uses outputsById
- [ ] StableIdHash uses outputsById
- [ ] TriggerOnWrap uses outputsById
- [ ] ClampSignal uses outputsById
- [ ] ColorLFO uses outputsById
- [ ] DivSignal uses outputsById
- [ ] MaxSignal uses outputsById
- [ ] MinSignal uses outputsById
- [ ] Shaper uses outputsById

**Code quality:**
- [ ] All 22 blocks return `{ outputs: [], outputsById: {...} }`
- [ ] Port IDs match block definitions exactly
- [ ] No TypeScript errors

**Tests:**
- [ ] All existing block tests pass
- [ ] No test modifications required (behavior unchanged)

---

### Work Item 2: Create IR Lowering for 3 Missing Blocks

**Files created:**
- [ ] `/src/editor/compiler/blocks/signal/BroadcastSignalColor.ts` created
- [ ] `/src/editor/compiler/blocks/defaultSources/DSConstSignalPhase.ts` created
- [ ] `/src/editor/compiler/blocks/defaultSources/DSConstSignalTime.ts` created

**Registration complete:**
- [ ] BroadcastSignalColor registered via `registerBlockType()`
- [ ] DSConstSignalPhase registered via `registerBlockType()`
- [ ] DSConstSignalTime registered via `registerBlockType()`
- [ ] Files imported in respective index.ts

**Verification:**
- [ ] `getBlockType('BroadcastSignalColor')` returns valid BlockTypeDecl
- [ ] `getBlockType('DSConstSignalPhase')` returns valid BlockTypeDecl
- [ ] `getBlockType('DSConstSignalTime')` returns valid BlockTypeDecl

---

### Work Item 3: Remove ALL Legacy Code

**Code sections removed:**
- [ ] Lines 718-751: Fallback for blocks without lowering (entire else block)
- [ ] Lines 665-676: Legacy output array processing (entire else block)
- [ ] Lines 604-621: Legacy input resolution fallback
- [ ] Lines 480-491: Wire writer fallback in getWriterValueRef()
- [ ] Lines 203-303: artifactToValueRef() function (101 lines)
- [ ] Lines 126-184: artifactKindToTypeDesc() function (59 lines)

**Verification:**
- [ ] No references to `artifactToValueRef` in pass6-block-lowering.ts
- [ ] No references to `artifactKindToTypeDesc` in pass6-block-lowering.ts
- [ ] No string "Legacy path" in pass6-block-lowering.ts
- [ ] No string "fall back" in pass6-block-lowering.ts
- [ ] No string "Fallback for blocks" in pass6-block-lowering.ts
- [ ] No `compiledPortMap.get(` calls in pass6-block-lowering.ts
- [ ] No `result.outputs.forEach` in pass6-block-lowering.ts

**Single code path verified:**
- [ ] lowerBlockInstance() calls getBlockType() → lower() → uses outputsById ONLY
- [ ] No conditional branches for fallback paths
- [ ] ~180 lines removed total

---

### Work Item 4: Update VERIFIED_IR_BLOCKS and Enable Strict Mode

**VERIFIED_IR_BLOCKS expanded:**
- [ ] Set contains all 60 registered blocks (not just 12)
- [ ] Includes all 22 migrated blocks
- [ ] Includes 3 new blocks (BroadcastSignalColor, DSConstSignalPhase, DSConstSignalTime)

**Strict mode enabled:**
- [ ] strictIR defaults to `true` (not `false`)
- [ ] Pass6Options.strictIR default changed

**compiledPortMap removed:**
- [ ] Parameter removed from pass6BlockLowering() signature
- [ ] Call site in compile.ts updated (line ~161)
- [ ] No references to compiledPortMap parameter in pass6-block-lowering.ts

---

### Work Item 5: Verification Test

**Test file created:**
- [ ] `/src/editor/compiler/__tests__/no-legacy-fallbacks.test.ts` exists

**Test cases pass:**
- [ ] Test 1: No legacy fallback code in pass6-block-lowering.ts (grep verification)
- [ ] Test 2: All blocks have IR lowering registered (getBlockType checks)
- [ ] Test 3: All blocks use outputsById pattern (result validation)

**Test enforcement:**
- [ ] Test fails if legacy code reintroduced
- [ ] Test runs in CI (`just test` includes it)

---

## Definition of DONE

**Sprint is DONE when ALL criteria met:**

✅ **Migration complete:**
- [ ] 22 blocks use outputsById
- [ ] 3 new IR lowering functions created

✅ **Legacy code removed:**
- [ ] ~180 lines deleted from pass6-block-lowering.ts
- [ ] Zero fallback code paths remain
- [ ] Zero references to artifactToValueRef

✅ **Strict mode enabled:**
- [ ] VERIFIED_IR_BLOCKS = all 60 blocks
- [ ] strictIR = true by default
- [ ] compiledPortMap parameter gone

✅ **Verification:**
- [ ] All tests pass (`just test`)
- [ ] TypeScript compiles (`just typecheck`)
- [ ] Build succeeds (`just build`)
- [ ] Verification test proves no legacy code

✅ **One code path:**
- [ ] pass6BlockLowering has exactly ONE execution path
- [ ] No conditional branches for legacy/fallback
- [ ] Success criteria fully met
