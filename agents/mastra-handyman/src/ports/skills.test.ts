// Unit tests for the skills port: the decoupled scope chain (feature
// mastra_runtime_decoupling — package-relative, project-scoped, env override),
// precedence on name collisions and the SKILL.md gate. Fixtures are tmp dirs
// — no repo state.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { experimentalSkillDirs, skillRegistry, skillSearchDirs } from './skills';

function fakeSkill(scopeDir: string, name: string): void {
  const dir = join(scopeDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), '# skill');
}

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'hm-skills-'));
}

describe('skillSearchDirs', () => {
  it('orders the default chain package > project > github > user', () => {
    const dirs = skillSearchDirs({ env: {}, projectRoot: '/proj' });
    expect(dirs[0]).toMatch(/agents\/mastra-handyman\/skills$/);
    expect(dirs[1]).toBe('/proj/.agents/skills');
    expect(dirs[2]).toBe('/proj/.github/skills');
    expect(dirs[3]?.endsWith('/.agents/skills')).toBe(true);
    expect(dirs).toHaveLength(4);
  });

  it('omits the project scopes when no projectRoot is given', () => {
    const dirs = skillSearchDirs({ env: {} });
    expect(dirs).toHaveLength(2);
    expect(dirs[0]).toMatch(/agents\/mastra-handyman\/skills$/);
  });

  it('HANDYMAN_SKILL_DIRS replaces the whole chain ( colon-separated )', () => {
    expect(skillSearchDirs({ env: { HANDYMAN_SKILL_DIRS: '/a:/b::/c' } })).toEqual([
      '/a',
      '/b',
      '/c',
    ]);
  });
});

describe('skillRegistry', () => {
  it('merges scopes and resolves name collisions to the FIRST scope', () => {
    const root = tmpRoot();
    const pkg = join(root, 'pkg');
    const project = join(root, 'project');
    const user = join(root, 'user');
    fakeSkill(pkg, 'pkg-skill');
    fakeSkill(project, 'project-skill');
    fakeSkill(user, 'user-skill');
    fakeSkill(pkg, 'shared');
    fakeSkill(project, 'shared');
    const registry = skillRegistry([pkg, project, user]);
    expect(registry['pkg-skill']).toBe(join(pkg, 'pkg-skill'));
    expect(registry['project-skill']).toBe(join(project, 'project-skill'));
    expect(registry['user-skill']).toBe(join(user, 'user-skill'));
    expect(registry['shared']).toBe(join(pkg, 'shared'));
  });

  it('ignores directories without SKILL.md and missing scopes', () => {
    const root = tmpRoot();
    const project = join(root, 'project');
    mkdirSync(join(project, 'not-a-skill'), { recursive: true });
    expect(skillRegistry([join(root, 'missing'), project])).toEqual({});
  });
});

describe('experimentalSkillDirs', () => {
  it('reads the first scope: HANDYMAN_SKILL_DIRS when set', () => {
    const root = tmpRoot();
    const dropIn = join(root, 'drop-in');
    fakeSkill(dropIn, 'deploy-skill');
    fakeSkill(join(root, 'other'), 'other-skill');
    expect(experimentalSkillDirs({ HANDYMAN_SKILL_DIRS: `${dropIn}:${join(root, 'other')}` })).toEqual([
      join(dropIn, 'deploy-skill'),
    ]);
  });

  it('defaults to the package scope (<package>/skills)', () => {
    // The package dir ships skills/ejemplo-skill (the canary) — the default
    // chain finds it without any repoRoot anchor.
    const dirs = experimentalSkillDirs({});
    expect(dirs.every((d) => d.includes('mastra-handyman/skills/'))).toBe(true);
  });
});
