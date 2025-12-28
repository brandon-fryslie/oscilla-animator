# Lenses vs Adapters Terminology Research Report

**Date**: 2025-12-21
**Context**: WP2 Bus-Aware Compiler P2 - "Standardize Lens Terminology in Spec" was SKIPPED per user request

## Findings

### Current Implementation State

The codebase consistently uses **"Lens"** terminology:
- `src/editor/lenses.ts` - Main implementation file (506 lines)
- `LensDefinition` interface type
- `applyLens()` function
- `lensStack` field in listeners

The specification uses **"Adapter"** terminology:
- `design-docs/3-Synthesized/04-Adapters.md` - File name and content

### Type System Analysis

Both terminologies coexist in the type system:
```typescript
// Current implementation uses:
interface LensDefinition {
  type: LensType;
  params: Record<string, unknown>;
}

// Legacy support exists:
interface Listener {
  // ... other fields
  lensStack?: LensDefinition[];
  adapterChain?: AdapterStep[]; // Backward compatibility
}
```

### Root Cause

This appears to be a terminology evolution during implementation:
1. Early design docs used "Adapter" (following adapter pattern terminology)
2. Implementation settled on "Lens" (more precise for functional transformation)
3. Backward compatibility maintained with `adapterChain` field

### Recommendation

**Keep current implementation** - The codebase made the right choice:
- "Lens" is more semantically accurate for functional transformations
- "Adapter" implies object-oriented wrapper pattern
- The implementation is pure functional transformation, not object adaptation

### Files That Would Need Changes (if P2 were implemented)

1. **Rename**: `design-docs/3-Synthesized/04-Adapters.md` → `04-Lenses.md`
2. **Update content**: Replace "Adapter" with "Lens" throughout
3. **Update cross-references**: In 03-Buses.md and 11-Roadmap.md
4. **Add note**: "Previously called 'Adapters' in early specs"

## Conclusion

The implementation correctly uses "Lens" terminology. The specification is outdated but contains the correct conceptual information. Aligning them would be purely cosmetic - the functionality and architecture are sound.