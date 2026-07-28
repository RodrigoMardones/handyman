// Workspace port (operator mandate 2026-07-28): the agents' access to the
// REAL system — filesystem, shell (git CLI lives here), and command
// execution — provided the Mastra-native way via Workspace
// (LocalFilesystem + LocalSandbox, @mastra/core/workspace, stable since
// 1.1.0). This replaces the spike-era gap where agents could only touch the
// world through the 25 domain MCP tools.
//
// Per-role surface (the hard rules are code, not prompt):
// - implementer / skill: WRITABLE filesystem + sandbox (edits code, runs the
//   verifier/tests/git inside the project root).
// - leader / reviewer: READ-ONLY filesystem, NO sandbox. For the reviewer
//   this also closes the structural debt "the MCP exposes no backlog read":
//   it now reads backlog/impl_<f>.md straight from disk — no new MCP tool,
//   no reports in the Mastra DB (business truth stays on disk, git-tracked;
//   see docs/adr-mastra-adopcion.md §3).
//
// Gotchas honored (Mastra docs): basePath is an ABSOLUTE path (relative
// resolves against process.cwd(), which shifts under mastra dev/start);
// LocalFilesystem stays `contained` to the project root (path-traversal and
// symlink safe); LocalSandbox is NOT a security boundary (isolation 'none')
// and exposes only PATH to child processes by default — API keys in
// process.env are not leaked into agent-run commands.
import { Workspace, LocalFilesystem, LocalSandbox } from '../mastra';

export type WorkspaceRole = 'leader' | 'implementer' | 'reviewer' | 'skill';

const WRITABLE_ROLES: ReadonlySet<WorkspaceRole> = new Set(['implementer', 'skill']);

/**
 * Build the per-role workspace rooted at the project the agent drives.
 * `projectRoot` must be absolute (HANDYMAN_PROJECT_ROOT / REPO_ROOT already are).
 */
export function roleWorkspace(role: WorkspaceRole, projectRoot: string): Workspace {
  const writable = WRITABLE_ROLES.has(role);
  return new Workspace({
    filesystem: new LocalFilesystem({ basePath: projectRoot, readOnly: !writable }),
    // Only writable roles get a shell: git/test/verifier execution is an
    // implementation concern; leader and reviewer probe through the MCP.
    ...(writable ? { sandbox: new LocalSandbox({ workingDirectory: projectRoot }) } : {}),
  });
}
