# Ambiguities / Open Decisions

This file lists unresolved details that should be decided early in the rewrite. Everything not listed here is considered defined by the unified spec.

1) **Custom combine mode registry**
   - Where do custom combine reducers live (block registry vs global combine registry)?
   - How are they validated against TypeDesc?

2) **Stateful primitive world coverage**
   - Should UnitDelay/Lag/SampleAndHold operate on all worlds (signal, field, event), or only on signal?
   - If fields are supported, define element identity rules for state storage.

3) **Default source catalog**
   - Standard default values per TypeDesc (e.g., color, vec2, phase) are not yet enumerated.
   - Decide where these defaults live and how they are surfaced in UI.

4) **Event semantics**
   - Precise event payload shape and edge-detection behavior remain unspecified.
   - Combine semantics for event payloads (beyond boolean fired) need explicit rules.
