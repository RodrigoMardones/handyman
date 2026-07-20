/**
 * Shim (feature 42): the toolBox LLM layer moved verbatim to
 * @handyman/toolbox-core (packages/toolbox-core/src/llm.ts). The Node
 * observer (toolbox_serve.ts) was decommissioned in feature 50; the
 * remaining consumers of this entrypoint are apps/web (via the package
 * exports) and tests/test_toolbox_llm.js.
 */
export * from "@handyman/toolbox-core/llm";
