# Work Evaluation - Sprint 2: Unify Default Sources with Blocks
Scope: work/sprint2-default-sources
Confidence: FRESH
Date: 2025-12-31-213828

## Goals Under Evaluation
From PLAN-2025-12-31-170000-sprint2-default-sources.md:
1. Replace separate default source metadata with hidden provider blocks
2. Eliminate special-case input resolution
3. Make every input backed by an edge

## Previous Evaluation Reference
No previous evaluation for this sprint.

## Persistent Check Results
| Check | Status | Output Summary |
|-------|--------|----------------|
| `just test` | MOSTLY PASS | 2779/2804 tests pass (4 failures unrelated to Sprint 2) |
| `just typecheck` | NOT RUN | - |
| Integration tests | NOT FOUND | No specific tests for materializeDefaultSources() |

## Manual Runtime Testing

### What I Tried
1. Code review of materializeDefaultSources() implementation
2. Verification of compiler integration
3. Check for DSConst* provider block definitions
4. Verification of type system updates
5. Search for removal of special-case code

### What Actually Happened

**✅ Implementation exists and is integrated:**
- `pass0-materialize.ts` created with `materializeDefaultSources()` function
- Function called in `integration.ts` line 1049 (System 2 before System 1)
- Creates hidden provider blocks for unconnected inputs

**✅ Provider blocks exist (mostly):**
- 9 DSConst* blocks defined in `default-source-providers.ts`
- Covers: Signal (float, int, color, vec2), Field (float, color, vec2), Scalar (string, waveform)
- Missing: DSConstScalarFloat, DSConstScalarInt

**✅ Type system partially updated:**
- Block.hidden and Block.role fields added (types.ts lines 662, 671)
- BlockRole type defined: 'defaultSourceProvider' | 'internal'

**❌ Old metadata NOT removed:**
- Patch.defaultSources still present (types.ts line 807)
- Patch.defaultSourceAttachments still present (types.ts line 810)
- DefaultSourceState and DefaultSourceAttachment types not removed

**❌ Special-case code NOT removed:**
- Pass 6 still has defaultSource fallback (pass6-block-lowering.ts lines 312-318)
- Uses `materializeDefaultSource()` helper instead of relying on materialized blocks
- This defeats the purpose of the refactor

## Data Flow Verification
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| Create providers | Generate DSConst* blocks | ✅ Creates BlockInstance with hidden:true | ✅ |
| Create connections | Wire providers to inputs | ✅ Creates CompilerConnection | ✅ |
| Integration | Called before pass 1 | ✅ Called at integration.ts:1049 | ✅ |
| Special cases removed | No defaultSource fallback | ❌ Pass 6 still has fallback | ❌ |

## Break-It Testing
Did not perform runtime testing - need actual execution to verify.

## Evidence

### 1. materializeDefaultSources() Implementation
File: `src/editor/compiler/passes/pass0-materialize.ts`
- Lines 112-195: Full implementation
- Scans blocks for unconnected inputs with defaultSource metadata
- Creates hidden provider blocks with deterministic IDs
- Creates CompilerConnection from provider to input

### 2. Compiler Integration
File: `src/editor/compiler/integration.ts`
- Line 1049: `patch = materializeDefaultSources(patch);`
- Called BEFORE `injectDefaultSourceProviders()` (System 2 before System 1)
- Properly sequenced in compilation pipeline

### 3. Missing Provider Blocks
Required but missing:
- DSConstScalarFloat (mapping defined but block doesn't exist)
- DSConstScalarInt (mapping defined but block doesn't exist)

### 4. Type System Status
File: `src/editor/types.ts`
- ✅ Lines 619-620: BlockRole type defined
- ✅ Lines 662-672: Block.hidden and Block.role fields added
- ❌ Lines 807-810: Old defaultSources/defaultSourceAttachments still present
- ❌ Line 14: DefaultSourceAttachment import still present

### 5. Special-Case Code Not Removed
File: `src/editor/compiler/passes/pass6-block-lowering.ts`
- Lines 312-318: Still checks `portDecl?.defaultSource`
- Still calls `materializeDefaultSource()` helper

## Assessment

### ✅ Working
1. **Default Source Materialization**: Function implemented correctly
2. **Compiler Integration**: Called at right point in pipeline
3. **Type Extensions**: Block.hidden and Block.role fields added
4. **Provider Block Coverage**: 9/11 provider blocks exist

### ❌ Not Working
1. **Missing Provider Blocks**: DSConstScalarFloat and DSConstScalarInt not defined
2. **Old Metadata Not Removed**: Patch.defaultSources and Patch.defaultSourceAttachments still present
3. **Special-Case Code Not Removed**: Pass 6 still has defaultSource fallback logic
4. **No Tests**: No unit or integration tests for materializeDefaultSources()
5. **Incomplete Deliverable 2**: Special-case removal from passes 2, 6, 7, 8 not done

### ⚠️ Ambiguities Found
| Decision | What Was Assumed | Should Have Asked | Impact |
|----------|------------------|-------------------|--------|
| Dual system approach | Keep both System 1 and System 2 | Is this the long-term design? | May cause confusion |
| Pass 6 fallback | Keep defaultSource fallback | Should this be removed? | Defeats refactor purpose |
| Missing providers | OK to skip scalar providers | Are they needed? | Compilation may fail for scalar inputs |

## Missing Checks (implementer should create)
1. **Unit tests for materializeDefaultSources()** (`tests/compiler/passes/pass0-materialize.test.ts`)
   - Creates hidden blocks for unconnected inputs
   - Preserves existing connections
   - Handles multiple unconnected inputs
   - Selects correct provider type

2. **Integration test for dual system** (`tests/compiler/default-sources-integration.test.ts`)
   - System 2 runs first
   - System 1 skips already-connected inputs
   - Both systems work together correctly

3. **Golden patch test** (`tests/compiler/golden-patch.test.ts`)
   - Compile patch with unmaterialized defaults
   - Verify hidden blocks created
   - Verify runtime output identical

## Verdict: INCOMPLETE

Sprint 2 is approximately **60% complete**.

**Completed:**
- ✅ Deliverable 1: materializeDefaultSources() implemented and integrated
- ✅ Partial Deliverable 3: Type system extensions (Block.hidden, Block.role)

**Not Completed:**
- ❌ Deliverable 2: Compiler pass special-case removal NOT DONE
- ❌ Deliverable 3: Old metadata removal NOT DONE
- ❌ Missing 2 provider blocks (DSConstScalarFloat, DSConstScalarInt)
- ❌ No tests written

**Major Issue:** The special-case code in Pass 6 means the materialization work is currently redundant. The compiler still falls back to the old defaultSource system, so the new hidden blocks are created but not actually used as intended.

## What Needs to Change

### Critical (blocks completion)
1. **Pass 6 (pass6-block-lowering.ts:312-318)** - Remove defaultSource fallback
   - Delete lines 312-318 (portDecl?.defaultSource check)
   - Rationale: After materialization, all inputs should have wires

2. **Add missing provider blocks** (default-source-providers.ts)
   - Add DSConstScalarFloat definition
   - Add DSConstScalarInt definition
   - Export both in block registry

3. **Remove old metadata** (types.ts:807-810)
   - Delete Patch.defaultSources field
   - Delete Patch.defaultSourceAttachments field
   - Mark DefaultSourceState as deprecated (or remove)
   - Mark DefaultSourceAttachment as deprecated (or remove)

### High Priority (validation)
4. **Write unit tests** (new file: tests/compiler/passes/pass0-materialize.test.ts)
   - Test materializeDefaultSources() with various inputs
   - Test provider type selection
   - Test preservation of existing connections

5. **Remove special cases from other passes** (DOD requirement)
   - Pass 2: Check if defaultSource type checking still present
   - Pass 7: Check if bus default handling still present
   - Pass 8: Check if defaultSource linking still present

### Medium Priority (polish)
6. **Clarify dual system design** (documentation)
   - Document why both System 1 and System 2 exist
   - Explain when each is used
   - Consider renaming to avoid confusion with "hidden provider" work

## Questions Needing Answers
1. **Is the dual system (System 1 + System 2) the intended long-term design?** Or should one replace the other?
2. **Should DSConstScalarFloat and DSConstScalarInt be added?** Are scalar inputs common enough to need dedicated providers?
3. **When should the old metadata be fully removed?** Is there a migration path for existing patches?

