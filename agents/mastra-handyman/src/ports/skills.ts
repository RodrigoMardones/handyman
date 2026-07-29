// Skills port. Two consumers, two scopes:
// - experimentalSkillDirs: the leader's drop-in skills (operator direction
//   2026-07-28): any directory under the FIRST scope (HANDYMAN_SKILL_DIRS when
//   set, else the package scope) that contains a SKILL.md is loaded as a
//   native agent-level skill — drop a folder in and it is live on the next
//   boot, no wiring edits. The leader (Studio chat) gets them; the skill
//   mirror keeps only the canonical handyman skill (its gate is "the skill
//   alone is the protocol source").
// - skillRegistry: every skill a workflow RUN may declare, searched across
//   ALL local scopes (first match wins on a name collision). A declared skill
//   the registry does not know fails submission, and the error lists where it
//   searched.
//
// Scope chain (feature mastra_runtime_decoupling — no repoRoot anchor):
//   HANDYMAN_SKILL_DIRS (':'-separated, replaces the whole chain)
//   > <this package>/skills                  (package scope)
//   > <projectRoot>/.agents/skills           (project scope)
//   > <projectRoot>/.github/skills           (project scope)
//   > ~/.agents/skills                       (user scope)
// The package scope resolves from THIS module (package-relative), so it works
// from any cwd. The old deployment scope (<repoRoot>/.agents/mastra-handyman/
// skills) is gone: it never existed on disk — deployments that used it must
// set HANDYMAN_SKILL_DIRS.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This package's own root (src/ports/skills.ts → ../..). */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface SkillScopes {
  /** Env bag (tests inject fakes); defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Driven project root; adds the two project scopes when present. */
  projectRoot?: string;
}

/** Local scopes searched for skills, most specific first. */
export function skillSearchDirs(scopes: SkillScopes = {}): string[] {
  const env = scopes.env ?? process.env;
  const override = env.HANDYMAN_SKILL_DIRS?.trim();
  if (override) return override.split(':').filter(Boolean);
  const dirs = [join(PACKAGE_ROOT, 'skills')]; // package
  if (scopes.projectRoot) {
    dirs.push(join(scopes.projectRoot, '.agents', 'skills')); // project
    dirs.push(join(scopes.projectRoot, '.github', 'skills')); // project
  }
  dirs.push(join(homedir(), '.agents', 'skills')); // user
  return dirs;
}

/** Absolute paths of the skill dirs (contain a SKILL.md) under one scope. */
function listSkillDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'SKILL.md')))
    .map((entry) => join(dir, entry.name));
}

/** Absolute paths of every experimental skill dir (first scope only — the
 *  drop-in location: HANDYMAN_SKILL_DIRS when set, else <package>/skills). */
export function experimentalSkillDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  const [first] = skillSearchDirs({ env });
  return first ? listSkillDirs(first) : [];
}

/** Skill registry for run declarations: skill name (dir basename) → absolute
 *  dir. On a name collision the FIRST scope wins. */
export function skillRegistry(searchDirs: readonly string[]): Record<string, string> {
  const registry: Record<string, string> = {};
  for (const dir of searchDirs) {
    for (const skillDir of listSkillDirs(dir)) {
      registry[basename(skillDir)] ??= skillDir;
    }
  }
  return registry;
}
