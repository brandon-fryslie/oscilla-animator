# Scalar:waveform Specification (Draft)

## Purpose
Define a canonical scalar domain for Oscillator waveform selection. This encodes a **static, compile-time** choice of waveform shape in the type system and IR lowering.

## Type
- **World:** `scalar`
- **Domain:** `waveform`

## Semantics
A `Scalar:waveform` represents a **pure, deterministic** waveform selector. It is a static configuration value, not time-varying, and must be resolved at compile time.

## Allowed Values
The initial allowed set is:
- `sine`
- `cosine`
- `triangle`
- `saw`

Values are **case-sensitive** string identifiers. Any other value is a compile-time error (or coerced to a default if the block explicitly defines a fallback).

## Oscillator Contract
For the Oscillator block:
- Input: `phase: Signal<phase>`
- Input: `shape: Scalar:waveform`
- Output: `out: Signal<number>`

The `shape` input must be provided via defaultSource or explicit wiring (scalar constant). It must not be time-varying.

## Lowering Requirements
- The compiler must lower `Scalar:waveform` to a constant in the IR constant pool.
- The Oscillator lowering reads the constant and selects the waveform kernel accordingly.

## Future Extensions
If more waveforms are added, they must be added to the allowed set and mapped explicitly in lowering. If a generic function registry is introduced, `Scalar:waveform` may be modeled as a constrained subset of `Scalar:fn`.
