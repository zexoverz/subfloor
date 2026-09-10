/// Re-export. The implementation lives in `frontend/api/_lib/` because that is what the image ships,
/// and one implementation with two entry points is better than two that drift.
export * from "../../../frontend/api/_lib/subgraph.ts";
