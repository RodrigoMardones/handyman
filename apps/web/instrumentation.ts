/**
 * Next.js instrumentation hook (feature 43): arm the toolBox runtime
 * (providers, SummaryCache, fs.watch hub) once at server boot, so the first
 * /events subscriber never races watcher setup. Node runtime only - the
 * observer state is a single-process invariant (plan principle 3: never
 * edge/serverless).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getRuntime } = await import("./lib/runtime");
    getRuntime();
  }
}
