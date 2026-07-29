// Experimental skills (operator direction 2026-07-28): any directory under
// <package>/skills/ that contains a SKILL.md is loaded as a native
// agent-level skill — drop a folder in and it is live on the next boot, no
// wiring edits. The leader (Studio chat) gets them; the skill mirror keeps
// only the canonical handyman skill (its gate is "the skill alone is the
// protocol source").
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Same anchoring convention as handyman-leader.ts: HANDYMAN_REPO_ROOT wins
// (mandatory under `mastra dev`, whose cwd is not the package dir).
const REPO_ROOT = process.env.HANDYMAN_REPO_ROOT ?? join(process.cwd(), '..', '..');

/** Directory scanned for experimental skills. */
export const EXPERIMENTAL_SKILLS_DIR = join(REPO_ROOT, '.agents', 'mastra-handyman', 'skills');

/** Absolute paths of every experimental skill dir (contains a SKILL.md). */
export function experimentalSkillDirs(): string[] {
  if (!existsSync(EXPERIMENTAL_SKILLS_DIR)) return [];
  return readdirSync(EXPERIMENTAL_SKILLS_DIR, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(EXPERIMENTAL_SKILLS_DIR, entry.name, 'SKILL.md')),
    )
    .map((entry) => join(EXPERIMENTAL_SKILLS_DIR, entry.name));
}
