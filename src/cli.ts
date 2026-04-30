import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

type FeatureStatus = "pending" | "in_progress" | "done" | "blocked" | string;

type Feature = {
  id: number | string;
  name?: string;
  title?: string;
  description?: string;
  acceptance?: string[];
  status: FeatureStatus;
};

type FeatureList = {
  project?: string;
  description?: string;
  config?: Partial<HarnessConfig>;
  rules?: {
    one_feature_at_a_time?: boolean;
    require_tests_to_close?: boolean;
    valid_status?: string[];
  };
  features: Feature[];
};

type HarnessConfig = {
  install_mode: "local" | "global" | string;
  project_name: string;
  project_root: string;
  foreman_root: string | null;
  harness_workspace: string;
};

type HarnessContext = {
  projectRoot: string;
  harnessWorkspace: string;
  installMode: string;
  projectName: string;
  foremanRoot: string | null;
};

export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type ParsedArgs = {
  projectRoot: string;
  command: string[];
};

type CommandResult = {
  exitCode?: number;
  stdout?: string[];
  stderr?: string[];
};

type ReviewCheck = { ok: true; path: string | null } | { ok: false; error: string };

const DEFAULT_VALID_STATUS = ["pending", "in_progress", "done", "blocked"];

export async function runCli(argv: string[], cwd = process.cwd()): Promise<CliResult> {
  const parsed = parseGlobalArgs(argv, cwd);
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    const result = runCommand(parsed);
    stdout.push(...(result.stdout ?? []));
    stderr.push(...(result.stderr ?? []));

    return {
      exitCode: result.exitCode ?? 0,
      stdout: stdout.length ? `${stdout.join("\n")}\n` : "",
      stderr: stderr.length ? `${stderr.join("\n")}\n` : ""
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: stdout.length ? `${stdout.join("\n")}\n` : "",
      stderr: `${error instanceof Error ? error.message : String(error)}\n`
    };
  }
}

function parseGlobalArgs(argv: string[], cwd: string): ParsedArgs {
  const command: string[] = [];
  let projectRoot = cwd;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if ((arg === "--project" || arg === "-C") && argv[index + 1]) {
      projectRoot = resolve(cwd, argv[index + 1]);
      index += 1;
      continue;
    }

    command.push(arg);
  }

  return { projectRoot, command };
}

function runCommand(parsed: ParsedArgs): CommandResult {
  const [command, subcommand, ...rest] = parsed.command;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { stdout: [helpText()] };
  }

  if (command === "status") {
    return statusCommand(parsed.projectRoot);
  }

  if (command === "config") {
    return configCommand(parsed.projectRoot);
  }

  if (command === "verify") {
    return verifyCommand(parsed.projectRoot);
  }

  if (command === "feature") {
    if (subcommand === "list") {
      return featureListCommand(parsed.projectRoot, rest);
    }

    if (subcommand === "start") {
      return featureStartCommand(parsed.projectRoot, rest);
    }

    if (subcommand === "block") {
      return featureBlockCommand(parsed.projectRoot, rest);
    }

    if (subcommand === "close") {
      return featureCloseCommand(parsed.projectRoot, rest);
    }
  }

  if (command === "progress" && subcommand === "show") {
    return progressShowCommand(parsed.projectRoot);
  }

  return {
    exitCode: 1,
    stderr: [`Unknown command: ${parsed.command.join(" ")}`, "Run `foreman help` for usage."]
  };
}

function helpText(): string {
  return [
    "Foreman CLI",
    "",
    "Usage:",
    "  foreman [--project <path>] status",
    "  foreman [--project <path>] config",
    "  foreman [--project <path>] verify",
    "  foreman [--project <path>] feature list [--status <status>]",
    "  foreman [--project <path>] feature start <id-or-name> [--agent <name>]",
    "  foreman [--project <path>] feature block <id-or-name> --reason <text>",
    "  foreman [--project <path>] feature close <id-or-name> [--review <path>] [--force]",
    "  foreman [--project <path>] progress show",
    "",
    "Core rule: Foreman edits mutable state only after resolving HARNESS_WORKSPACE."
  ].join("\n");
}

function resolveHarness(projectRootInput: string): HarnessContext {
  const projectRoot = realpathSync(resolve(projectRootInput));
  const configPath = join(projectRoot, "harness.config.json");

  if (existsSync(configPath)) {
    const config = readJson<HarnessConfig>(configPath);
    const configProjectRoot = resolveMaybe(projectRoot, config.project_root || projectRoot);
    const harnessWorkspace = resolveMaybe(configProjectRoot, config.harness_workspace);

    return {
      projectRoot: configProjectRoot,
      harnessWorkspace,
      installMode: config.install_mode || "global",
      projectName: config.project_name || basename(configProjectRoot),
      foremanRoot: config.foreman_root ? resolveMaybe(configProjectRoot, config.foreman_root) : null
    };
  }

  const featureListPath = join(projectRoot, "feature_list.json");

  if (existsSync(featureListPath)) {
    const featureList = readJson<FeatureList>(featureListPath);
    const config = featureList.config;

    if (config?.harness_workspace) {
      const configProjectRoot = resolveMaybe(projectRoot, config.project_root || projectRoot);

      return {
        projectRoot: configProjectRoot,
        harnessWorkspace: resolveMaybe(configProjectRoot, config.harness_workspace),
        installMode: config.install_mode || "local",
        projectName: config.project_name || featureList.project || basename(configProjectRoot),
        foremanRoot: config.foreman_root ? resolveMaybe(configProjectRoot, config.foreman_root) : null
      };
    }
  }

  return {
    projectRoot,
    harnessWorkspace: projectRoot,
    installMode: "local",
    projectName: basename(projectRoot),
    foremanRoot: null
  };
}

function statusCommand(projectRoot: string): CommandResult {
  const context = resolveHarness(projectRoot);
  const featureListResult = tryLoadFeatureList(context);
  const currentPath = join(context.harnessWorkspace, "progress", "current.md");
  const historyPath = join(context.harnessWorkspace, "progress", "history.md");
  const lines = [
    "Foreman status",
    `Project: ${context.projectName}`,
    `Install mode: ${context.installMode}`,
    `Project root: ${context.projectRoot}`,
    `Harness workspace: ${context.harnessWorkspace}`
  ];

  if (!featureListResult.ok) {
    return {
      exitCode: 1,
      stdout: lines,
      stderr: [featureListResult.error]
    };
  }

  const featureList = featureListResult.featureList;
  const active = featureList.features.filter((feature) => feature.status === "in_progress");
  const pending = featureList.features.filter((feature) => feature.status === "pending");
  const blocked = featureList.features.filter((feature) => feature.status === "blocked");
  const done = featureList.features.filter((feature) => feature.status === "done");

  lines.push(
    `Features: ${featureList.features.length} total, ${pending.length} pending, ${active.length} in_progress, ${blocked.length} blocked, ${done.length} done`,
    `Active feature: ${active.length ? formatFeature(active[0]) : "none"}`,
    `Current progress: ${existsSync(currentPath) ? currentPath : "missing"}`,
    `History: ${existsSync(historyPath) ? historyPath : "missing"}`
  );

  const validation = validateFeatureList(featureList);

  return {
    exitCode: validation.ok ? 0 : 1,
    stdout: lines,
    stderr: validation.ok ? [] : validation.errors
  };
}

function configCommand(projectRoot: string): CommandResult {
  const context = resolveHarness(projectRoot);

  return {
    stdout: [
      `install_mode=${context.installMode}`,
      `project_name=${context.projectName}`,
      `project_root=${context.projectRoot}`,
      `foreman_root=${context.foremanRoot ?? ""}`,
      `harness_workspace=${context.harnessWorkspace}`
    ]
  };
}

function verifyCommand(projectRoot: string): CommandResult {
  const context = resolveHarness(projectRoot);
  const errors: string[] = [];
  const lines: string[] = ["Foreman verify", `Harness workspace: ${context.harnessWorkspace}`];

  const requiredPaths = [
    join(context.harnessWorkspace, "feature_list.json"),
    join(context.harnessWorkspace, "progress", "current.md"),
    join(context.harnessWorkspace, "progress", "history.md"),
    join(context.harnessWorkspace, "docs", "architecture.md"),
    join(context.harnessWorkspace, "docs", "conventions.md"),
    join(context.harnessWorkspace, "docs", "verification.md"),
    join(context.projectRoot, "CHECKPOINTS.md")
  ];

  for (const requiredPath of requiredPaths) {
    if (!existsSync(requiredPath)) {
      errors.push(`Missing required path: ${requiredPath}`);
    }
  }

  const featureListResult = tryLoadFeatureList(context);

  if (!featureListResult.ok) {
    errors.push(featureListResult.error);
  } else {
    const validation = validateFeatureList(featureListResult.featureList);
    errors.push(...validation.errors);
  }

  const initPath = join(context.projectRoot, "init.sh");

  if (!existsSync(initPath)) {
    errors.push(`Missing verifier: ${initPath}`);
  } else {
    const verifier = spawnSync(initPath, {
      cwd: context.projectRoot,
      encoding: "utf8",
      shell: false
    });

    if (verifier.stdout?.trim()) {
      lines.push("", "Verifier stdout:", verifier.stdout.trim());
    }

    if (verifier.stderr?.trim()) {
      lines.push("", "Verifier stderr:", verifier.stderr.trim());
    }

    if (verifier.error) {
      errors.push(`Verifier failed to run: ${verifier.error.message}`);
    } else if (verifier.status !== 0) {
      errors.push(`Verifier exited ${verifier.status ?? "unknown"}: ${initPath}`);
    }
  }

  if (errors.length === 0) {
    lines.push("OK");
  }

  return {
    exitCode: errors.length === 0 ? 0 : 1,
    stdout: lines,
    stderr: errors
  };
}

function featureListCommand(projectRoot: string, args: string[]): CommandResult {
  const context = resolveHarness(projectRoot);
  const featureList = loadFeatureList(context);
  const statusFilter = readOption(args, "--status");
  const features = statusFilter
    ? featureList.features.filter((feature) => feature.status === statusFilter)
    : featureList.features;

  const rows = features.map((feature) => [
    String(feature.id),
    feature.status,
    feature.name || "-",
    feature.title || feature.description || "-"
  ]);

  return {
    stdout: [formatTable(["ID", "Status", "Name", "Title"], rows)]
  };
}

function featureStartCommand(projectRoot: string, args: string[]): CommandResult {
  const featureId = args[0];

  if (!featureId) {
    return { exitCode: 1, stderr: ["Usage: foreman feature start <id-or-name> [--agent <name>]"] };
  }

  const context = resolveHarness(projectRoot);
  const featureList = loadFeatureList(context);
  const validation = validateFeatureList(featureList);

  if (!validation.ok) {
    return { exitCode: 1, stderr: validation.errors };
  }

  const feature = findFeature(featureList, featureId);

  if (!feature) {
    return { exitCode: 1, stderr: [`Feature not found: ${featureId}`] };
  }

  if (feature.status !== "pending") {
    return { exitCode: 1, stderr: [`Feature ${featureId} must be pending to start. Current status: ${feature.status}`] };
  }

  const active = featureList.features.find((candidate) => candidate.status === "in_progress");

  if (active) {
    return { exitCode: 1, stderr: [`Feature already in progress: ${formatFeature(active)}`] };
  }

  feature.status = "in_progress";
  writeFeatureList(context, featureList);
  writeCurrentSession(context, feature, readOption(args, "--agent") || "foreman-cli");

  return {
    stdout: [`Started feature: ${formatFeature(feature)}`, `Updated: ${join(context.harnessWorkspace, "progress", "current.md")}`]
  };
}

function featureBlockCommand(projectRoot: string, args: string[]): CommandResult {
  const featureId = args[0];
  const reason = readOption(args, "--reason");

  if (!featureId || !reason) {
    return { exitCode: 1, stderr: ["Usage: foreman feature block <id-or-name> --reason <text>"] };
  }

  const context = resolveHarness(projectRoot);
  const featureList = loadFeatureList(context);
  const feature = findFeature(featureList, featureId);

  if (!feature) {
    return { exitCode: 1, stderr: [`Feature not found: ${featureId}`] };
  }

  if (feature.status === "done") {
    return { exitCode: 1, stderr: [`Feature ${featureId} is done and cannot be blocked.`] };
  }

  feature.status = "blocked";
  writeFeatureList(context, featureList);
  appendCurrentLog(context, `Blocked ${formatFeature(feature)}: ${reason}`);

  return {
    stdout: [`Blocked feature: ${formatFeature(feature)}`, `Reason: ${reason}`]
  };
}

function featureCloseCommand(projectRoot: string, args: string[]): CommandResult {
  const featureId = args[0];

  if (!featureId) {
    return { exitCode: 1, stderr: ["Usage: foreman feature close <id-or-name> [--review <path>] [--force]"] };
  }

  const context = resolveHarness(projectRoot);
  const featureList = loadFeatureList(context);
  const feature = findFeature(featureList, featureId);

  if (!feature) {
    return { exitCode: 1, stderr: [`Feature not found: ${featureId}`] };
  }

  if (feature.status !== "in_progress") {
    return { exitCode: 1, stderr: [`Feature ${featureId} must be in_progress to close. Current status: ${feature.status}`] };
  }

  const force = args.includes("--force");
  const reviewCheck: ReviewCheck = force
    ? { ok: true, path: null }
    : findApprovedReview(context, feature, readOption(args, "--review"));

  if (!reviewCheck.ok) {
    return {
      exitCode: 1,
      stderr: [
        reviewCheck.error,
        "Add an APPROVED review report or pass --force when intentionally bypassing review."
      ]
    };
  }

  const verifyResult = verifyCommand(context.projectRoot);

  if (verifyResult.exitCode !== 0) {
    return {
      exitCode: 1,
      stdout: verifyResult.stdout,
      stderr: ["Cannot close feature because verification failed.", ...(verifyResult.stderr ?? [])]
    };
  }

  feature.status = "done";
  writeFeatureList(context, featureList);
  appendHistory(context, feature, reviewCheck.path, force);
  resetCurrentSession(context);

  return {
    stdout: [
      `Closed feature: ${formatFeature(feature)}`,
      `Review: ${reviewCheck.path ?? "bypassed with --force"}`,
      `Updated history: ${join(context.harnessWorkspace, "progress", "history.md")}`
    ]
  };
}

function progressShowCommand(projectRoot: string): CommandResult {
  const context = resolveHarness(projectRoot);
  const currentPath = join(context.harnessWorkspace, "progress", "current.md");

  if (!existsSync(currentPath)) {
    return { exitCode: 1, stderr: [`Missing current session file: ${currentPath}`] };
  }

  return { stdout: [readFileSync(currentPath, "utf8").trimEnd()] };
}

function tryLoadFeatureList(context: HarnessContext): { ok: true; featureList: FeatureList } | { ok: false; error: string } {
  const featureListPath = join(context.harnessWorkspace, "feature_list.json");

  if (!existsSync(featureListPath)) {
    return { ok: false, error: `Missing feature list: ${featureListPath}` };
  }

  try {
    const featureList = readJson<FeatureList>(featureListPath);

    if (!Array.isArray(featureList.features)) {
      return { ok: false, error: `Invalid feature list: ${featureListPath} must contain a features array` };
    }

    return { ok: true, featureList };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function loadFeatureList(context: HarnessContext): FeatureList {
  const result = tryLoadFeatureList(context);

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.featureList;
}

function validateFeatureList(featureList: FeatureList): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const validStatus = featureList.rules?.valid_status ?? DEFAULT_VALID_STATUS;
  const inProgress = featureList.features.filter((feature) => feature.status === "in_progress");

  if (inProgress.length > 1) {
    errors.push(`Invalid feature state: ${inProgress.length} features are in_progress`);
  }

  for (const feature of featureList.features) {
    if (!validStatus.includes(feature.status)) {
      errors.push(`Feature ${feature.id} has invalid status: ${feature.status}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function writeFeatureList(context: HarnessContext, featureList: FeatureList): void {
  const featureListPath = join(context.harnessWorkspace, "feature_list.json");
  writeFileSync(featureListPath, `${JSON.stringify(featureList, null, 2)}\n`);
}

function findFeature(featureList: FeatureList, idOrName: string): Feature | undefined {
  return featureList.features.find((feature) => String(feature.id) === idOrName || feature.name === idOrName);
}

function writeCurrentSession(context: HarnessContext, feature: Feature, agent: string): void {
  const progressDir = join(context.harnessWorkspace, "progress");
  mkdirSync(progressDir, { recursive: true });
  const currentPath = join(progressDir, "current.md");
  const now = new Date().toISOString();

  writeFileSync(currentPath, [
    "# Current Session",
    "",
    `- **Feature in progress:** ${formatFeature(feature)}`,
    `- **Start:** ${now}`,
    `- **Agent:** ${agent}`,
    "",
    "## Plan",
    "",
    "- Confirm harness state.",
    "- Implement the selected acceptance criteria.",
    "- Run verifier from PROJECT_ROOT.",
    "- Write implementation and review evidence.",
    "",
    "## Log",
    "",
    `- ${now}: Started ${formatFeature(feature)} via Foreman CLI.`,
    "",
    "## Next Step",
    "",
    "Implement the selected acceptance criteria and keep this session updated.",
    ""
  ].join("\n"));
}

function appendCurrentLog(context: HarnessContext, line: string): void {
  const progressDir = join(context.harnessWorkspace, "progress");
  mkdirSync(progressDir, { recursive: true });
  const currentPath = join(progressDir, "current.md");
  const now = new Date().toISOString();

  if (!existsSync(currentPath)) {
    resetCurrentSession(context);
  }

  appendFileSync(currentPath, `\n- ${now}: ${line}\n`);
}

function resetCurrentSession(context: HarnessContext): void {
  const progressDir = join(context.harnessWorkspace, "progress");
  mkdirSync(progressDir, { recursive: true });
  const currentPath = join(progressDir, "current.md");

  writeFileSync(currentPath, [
    "# Current Session",
    "",
    "This file is reset when a session closes and its summary moves to `history.md`.",
    "",
    "- **Feature in progress:** _none_",
    "- **Start:** _-_",
    "- **Agent:** _-_",
    "",
    "## Plan",
    "",
    "_No active session._",
    "",
    "## Log",
    "",
    "_No active session._",
    "",
    "## Next Step",
    "",
    "Start the next pending feature.",
    ""
  ].join("\n"));
}

function appendHistory(context: HarnessContext, feature: Feature, reviewPath: string | null, forced: boolean): void {
  const progressDir = join(context.harnessWorkspace, "progress");
  mkdirSync(progressDir, { recursive: true });
  const historyPath = join(progressDir, "history.md");
  const now = new Date().toISOString();

  if (!existsSync(historyPath)) {
    writeFileSync(historyPath, "# Session History\n\nAppend-only. Do not edit earlier entries during normal work.\n");
  }

  appendFileSync(historyPath, [
    "",
    "---",
    "",
    `## ${now} - Feature ${feature.id}: ${feature.name || feature.title || "unnamed"}`,
    "- **Agent:** foreman-cli",
    `- **Verification:** foreman verify exited 0`,
    `- **Review:** ${reviewPath ?? (forced ? "bypassed with --force" : "not provided")}`,
    "- **Closure:** done",
    ""
  ].join("\n"));
}

function findApprovedReview(
  context: HarnessContext,
  feature: Feature,
  reviewArg: string | undefined
): ReviewCheck {
  const candidates = reviewArg
    ? [resolveMaybe(context.projectRoot, reviewArg)]
    : defaultReviewCandidates(context, feature);

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    const content = readFileSync(candidate, "utf8");

    if (/\bAPPROVED\b/.test(content)) {
      return { ok: true, path: candidate };
    }

    return { ok: false, error: `Review report is not approved: ${candidate}` };
  }

  return { ok: false, error: `Missing approved review report. Checked: ${candidates.join(", ")}` };
}

function defaultReviewCandidates(context: HarnessContext, feature: Feature): string[] {
  const names = [feature.name, String(feature.id)].filter((value): value is string => Boolean(value));

  return names.map((name) => join(context.harnessWorkspace, "progress", `review_${sanitizeFilePart(name)}.md`));
}

function formatFeature(feature: Feature): string {
  const label = feature.title || feature.name || feature.description || "untitled";
  return `${feature.id} ${feature.name ? `(${feature.name}) ` : ""}- ${label}`;
}

function formatTable(headers: string[], rows: string[][]): string {
  const allRows = [headers, ...rows];
  const widths = headers.map((_, columnIndex) => Math.max(...allRows.map((row) => row[columnIndex]?.length ?? 0)));
  const render = (row: string[]) => row.map((value, columnIndex) => value.padEnd(widths[columnIndex])).join("  ").trimEnd();

  return [render(headers), render(widths.map((width) => "-".repeat(width))), ...rows.map(render)].join("\n");
}

function readJson<T>(filePath: string): T {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    throw new Error(`Failed to read JSON ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function resolveMaybe(basePath: string, pathValue: string): string {
  return isAbsolute(pathValue) ? pathValue : resolve(basePath, pathValue);
}

function readOption(args: string[], optionName: string): string | undefined {
  const index = args.indexOf(optionName);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_");
}
