// Experimental skills (operator direction 2026-07-28): any directory under
// <repoRoot>/.agents/mastra-handyman/skills/ that contains a SKILL.md is
// loaded as a native agent-level skill — drop a folder in and it is live on
// the next boot, no wiring edits. The leader (Studio chat) gets them; the
// skill mirror keeps only the canonical handyman skill (its gate is "the
// skill alone is the protocol source").
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Absolute paths of every experimental skill dir (contains a SKILL.md). */
export function experimentalSkillDirs(repoRoot: string): string[] {
  const dir = join(repoRoot, '.agents', 'mastra-handyman', 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'SKILL.md')))
    .map((entry) => join(dir, entry.name));
}
