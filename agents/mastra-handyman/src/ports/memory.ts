// Memory port (phase 2). Two DISTINCT concerns, kept separate on purpose:
//
// 1. CONVERSATION memory (Mastra-owned): threads/messages persisted in
//    LibSQL. One THREAD per feature, one RESOURCE per project — replaces the
//    Flue "one agent instance per feature" pattern with parallel isolated
//    conversations over stateless agent definitions.
// 2. BUSINESS memory (handyman-owned): `.handyman/memory/*.md` on disk is the
//    source of truth and stays so. We do NOT mirror it into Mastra's working
//    memory (that would create a second truth in the DB); we INJECT a
//    read-only snapshot into the instructions on every call, so edits to the
//    .md files are picked up on the next run and the disk always wins.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LibSQLStore, Memory } from '../mastra';

// One live process per data dir: the DuckDB observability store takes an
// exclusive native file lock (single writer), so parallel runs MUST point at
// separate data dirs via HANDYMAN_DATA_DIR. Same deployment rule as the Flue
// package's "one process per instance", and the lock error is FATAL to the
// run (it rejects the model stream), not a degraded export.
export const DATA_DIR = process.env.HANDYMAN_DATA_DIR ?? join(process.cwd(), 'data');

/** Conversation storage + Memory facade (thread per feature, resource per project). */
export function createConversationMemory() {
  // SQLite drivers create the DB file but NOT its parent directory.
  mkdirSync(DATA_DIR, { recursive: true });
  const storage = new LibSQLStore({
    id: 'handyman-mastra-memory',
    url: `file:${join(DATA_DIR, 'mastra.db')}`,
  });
  const memory = new Memory({
    storage,
    options: {
      // Bounded recent history per thread; business context arrives via
      // instruction injection (below), not via unbounded transcripts.
      lastMessages: 40,
    },
  });
  return { storage, memory };
}

/** Memory coordinates for one feature run: thread = feature, resource = project. */
export function featureThread(feature: string, project: string) {
  return { thread: feature, resource: projectResourceId(project) };
}

/** Stable resource id for a project root (one conversation space per project). */
export function projectResourceId(project: string): string {
  return `project:${project.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

const BUSINESS_MEMORY_FILES = ['business.md', 'architecture.md', 'conventions.md', 'verification.md'];

/** Read-only snapshot of the project's business memory (.handyman/memory/*.md),
 *  injected into instructions. Missing files (fresh scaffolds) are skipped. */
export function businessMemorySnapshot(project: string): string {
  const dir = join(project, '.handyman', 'memory');
  const sections: string[] = [];
  for (const file of BUSINESS_MEMORY_FILES) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    const body = readFileSync(path, 'utf-8').trim();
    if (body.length > 0) sections.push(`### ${file}\n${body}`);
  }
  if (sections.length === 0) return '';
  return `\n\n## Business memory (read-only snapshot from .handyman/memory/)\n${sections.join('\n\n')}`;
}
