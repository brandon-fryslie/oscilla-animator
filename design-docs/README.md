# Design Documentation

## Reading Guide (Unified Spec)

Start here:

- `spec/INDEX.md` - unified spec index and migration target

The unified spec in `spec/` supersedes older or conflicting documents. Other directories are supporting material, not sources of truth.

## Directory Guide

| Directory | Purpose |
| --- | --- |
| `spec/` | Unified spec to build the new system |
| `ui/` | UI behavior and interaction details |
| `reference/` | Examples, roadmap, and catalogs |
| `implementation/` | Legacy implementation details (use selectively) |
| `future/` | Deferred ideas to keep for later |
| `historical/` | Superseded notes and drafts |

## Notes

- Buses are blocks; multi-writer inputs are mandatory.
- Only finite/infinite time models exist.
- The compiler never inserts blocks or edges.
