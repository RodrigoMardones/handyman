// Unit tests for the workspace port: the skill-source wiring that lets the
// SkillSearchProcessor read skill scopes OUTSIDE the contained project
// filesystem (user scope, monorepo scopes). Fixtures are tmp dirs.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { roleWorkspace } from './workspace';

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'hm-ws-'));
}

describe('roleWorkspace skills', () => {
  it('discovers skills in dirs OUTSIDE the contained basePath (via skillSource)', async () => {
    const projectRoot = tmpRoot();
    const externalScope = tmpRoot(); // deliberately outside projectRoot
    const skillDir = join(externalScope, 'ext-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: ext-skill\ndescription: External test skill\n---\n# ext-skill\n',
    );

    const ws = roleWorkspace('implementer', projectRoot, { skillDirs: [externalScope] });
    const skills = (await ws.skills?.list()) ?? [];
    expect(skills.map((s) => s.name)).toContain('ext-skill');
  });

  it('exposes no skills interface paths when skillDirs is omitted', async () => {
    const ws = roleWorkspace('implementer', tmpRoot());
    const skills = (await ws.skills?.list()) ?? [];
    expect(skills).toEqual([]);
  });
});
