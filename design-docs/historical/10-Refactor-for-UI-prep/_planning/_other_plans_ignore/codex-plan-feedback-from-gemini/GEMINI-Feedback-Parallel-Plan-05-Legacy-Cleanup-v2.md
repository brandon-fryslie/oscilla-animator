### GEMINI-Feedback on Parallel-Plan-05-Legacy-Cleanup-v2.md

**Overall Impression:**
This plan serves as the final, crucial step in the refactoring process, focusing on removing technical debt and simplifying the codebase. It correctly acknowledges its dependency on the stability of other workstreams.

**Strengths:**
*   **Clear Goal:** The goal of removing deprecated APIs and reducing complexity is essential for long-term maintainability.
*   **Dependency Awareness:** Explicitly states its dependency on Workstreams 01-04 reaching stability, which is correctly reflected in the master plan's dependency graph (Gate F depends on A-E).
*   **Systematic Approach:** Starting with inventory before removal is a good practice to ensure nothing is missed or prematurely deleted.
*   **Deliverables:** The deliverables directly address the goal of a cleaner, more focused codebase.
*   **Tests and Docs:** Emphasizing updating tests and docs to reflect the new canonical systems is vital.

**Suggestions for Improvement/Questions:**

1.  **"Inventory" Granularity (Task 1.1):**
    *   Could specify tools or methods for inventorying (e.g., static analysis, grep patterns, reviewing `git blame` for older code).
    *   Beyond just listing, perhaps categorize by "safe to remove," "requires migration," "requires careful audit."
    *   "Identify saved patch migration requirements" is critical. This could become a significant sub-task itself, potentially requiring a separate mini-plan or strategy document if the complexity is high. For example, how will old patch JSONs that refer to `LaneName` or old parameter structures be loaded and converted to the new format? This needs to be robust to prevent user data loss.
2.  **Definition of "Stable":** This plan relies heavily on other workstreams being "stable." As raised in the `Master-Parallel-Plan-v2.md` feedback, a clear definition of "stable" (e.g., unit/integration/end-to-end tests passing, code reviews complete, deployed to a staging environment) would be beneficial.
3.  **Removal Strategy:** For potentially large removals (e.g., `src/editor/index.ts` exports), will there be a phased removal (e.g., deprecate, then warn, then remove) or a hard cut-off? Given the scale of refactoring, a phased approach might minimize disruption.
4.  **Impact Analysis of Removals:** Before removing, how will the team ensure there are no unforeseen external dependencies or integrations (e.g., external tools, documentation, or user workflows not immediately apparent in the codebase) that rely on these "legacy" bits? A cross-functional review might be needed.
5.  **"Simplify stores to rely on the canonical graph + view state" (Task 3.1):** This could be a significant refactoring effort within the stores themselves. It implies that `RootStore`, `PatchStore`, `BusStore`, and `UIStateStore` (and now `ViewStateStore`) will be streamlined. It might be worth a brief call-out to `MobX` implications or strategies here.
6.  **"Full usage scan" (Deliverable):** How will this be performed? Automated tools, manual code review, test coverage?

This plan is well-positioned to bring the refactor to a clean conclusion. Providing more detail on the migration strategy for saved patches and the "stable" definition would further enhance its robustness.
