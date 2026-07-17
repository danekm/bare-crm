#!/usr/bin/env node
/*
Generated from 7steps-platform app architecture contract.
Do not hand-edit contract fields; update Platform contract templates instead.
*/
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const appCheckoutRoot =
  basename(dirname(repoRoot)) === "worktrees" &&
    basename(dirname(dirname(repoRoot))) === ".agent"
    ? resolve(repoRoot, "..", "..", "..")
    : repoRoot;
const defaultAgentWorktreeRoot =
  "/Users/danielmatousek/Development/7steps/worktrees/7steps-platform";
const repoKey = "crm";
const command = process.argv[2];
const rawPassthrough = process.argv.slice(3);
const visualSkipFlags = new Set(["--skip-visual", "--skip-visual=true"]);
const passthrough = rawPassthrough.filter((arg) => !visualSkipFlags.has(arg));
const supported = new Set([
  "doctor",
  "secrets",
  "dev:scope",
  "dev:preflight",
  "dev:start",
  "dev:preedit",
  "dev:validate",
  "dev:submit",
  "dev:status",
  "dev:ci",
  "dev:reconcile",
  "dev:approve",
  "ops:status",
  "ops:health",
  "ops:vps",
  "ops:workers",
  "ops:queue",
  "ops:alerts",
  "ops:incidents",
  "ops:dashboard",
  "scope-review",
  "scope-apply",
  "workspace",
  "preflight",
  "plan-gate",
  "start",
  "preedit",
  "delivery-status",
  "delivery-sync",
  "refresh-checks",
  "finish",
  "reconcile",
  "closeout",
  "submit",
  "decide",
  "run",
  "states",
  "triage",
  "router",
  "watch",
  "status",
  "enforce-local-pass",
  "owner-approve",
  "review",
  "risk",
  "review-recovery",
  "lease",
  "contract",
  "validate",
  "merge-queue-gate",
  "recover-stuck",
  "fix-ci",
  "repair-blocked",
  "tool",
  "validate"
]);
const normalOperatorCommands = [
  "dev:scope",
  "dev:preflight",
  "dev:start",
  "dev:preedit",
  "dev:validate",
  "dev:submit",
  "dev:status",
  "dev:ci",
  "dev:reconcile",
  "dev:approve",
  "ops:status",
  "ops:health",
  "ops:vps",
  "ops:workers",
  "ops:queue",
  "ops:alerts",
  "ops:incidents",
  "ops:dashboard"
];
const normalOperatorControls = [
  "Scope",
  "Start Work",
  "Validate",
  "Submit",
  "Status",
  "CI",
  "Reconcile",
  "Approve",
  "Ops Status",
  "Ops Health",
  "VPS",
  "Workers",
  "Queue",
  "Alerts",
  "Incidents",
  "Dashboard"
];
const runnerInfrastructureCommands = [
  "run"
];
const requiredWorkflowCapabilities = [
  "startPreparesLocalBranch",
  "handoffPublishesLocalBuildPassed",
  "ticketFirstPlanGate",
  "requiredSessionPreflight",
  "enforceLocalPass",
  "repoRootValidation",
  "localValidationStatus",
  "writeCredentialPreflight",
  "readyStatePickupGate",
  "finishFinalizesPr",
  "finalizedStatus",
  "autoMergeEligible",
  "stuckRecovery",
  "platformOwnedAgentGates",
  "platformRegistryExport",
  "riskApprovalRequiredState",
  "reviewPolicyStatus",
  "refreshChecksCommand",
  "pureFinalizer",
  "patchReviewEvidenceCache",
  "stableRunnerValidation",
  "ownerApprovalEvidence",
  "workerOwnershipFallbackGate",
  "unifiedWorkerWatchdogRecovery",
  "platformWorkflowStateRepair",
  "explicitHumanReviewStates",
  "decisionPacketGate",
  "triageReadinessGate",
  "decompositionReadinessGate",
  "codexBudgetGuard",
  "screenshotEvidenceGate",
  "preFinishRiskRepairGate",
  "mergeQueueGate",
  "deliveryStatusProjection",
  "canonicalEngineCommandSurface",
  "remoteCredentialPreflight",
  "externalBlockerRetryGate",
  "structuredRiskItems",
  "dirtySafeTicketWorkspaces",
  "approvalDeltaCarryForwardGate",
  "unifiedTicketWorkflowContract",
  "decideCommandSurface"
];
const writeGatedCommands = new Set(["dev:scope", "dev:preflight", "dev:start", "dev:preedit", "dev:validate", "dev:submit", "dev:reconcile", "dev:approve", "scope-review", "scope-apply", "preflight", "start", "preedit", "delivery-status", "refresh-checks", "finish", "reconcile", "closeout", "submit", "decide", "run", "triage", "watch", "enforce-local-pass", "owner-approve", "risk", "review", "review-recovery", "delivery-sync", "tool", "validate", "merge-queue-gate"]);
const diagnosticCommands = new Set(["doctor", "secrets", "contract"]);
const explicitPlatformPath = process.env.AGENT_PLATFORM_PATH?.trim();

if (!command || !supported.has(command)) {
  console.error(`Operator controls: ${normalOperatorControls.join(" | ")}`);
  console.error(`Usage: npm run agent:<${normalOperatorCommands.join("|")}> -- [args]`);
  console.error(`Runner infrastructure only: npm run agent:<${runnerInfrastructureCommands.join("|")}> -- [args]`);
  process.exit(1);
}

function existingAgentWorktrees(root = defaultAgentWorktreeRoot) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => join(root, entry.name));
  } catch {
    return [];
  }
}

function candidateSupportsRequiredCapabilities(candidate) {
  for (const relativePath of [
    ["tools", "developer-platform", "agent-workflow", "mod.ts"],
    ["tools", "agent-workflow", "mod.ts"],
  ]) {
    try {
      const workflowSource = readFileSync(join(candidate, ...relativePath), "utf8");
      if (requiredWorkflowCapabilities.every((capability) => workflowSource.includes(capability))) {
        return true;
      }
    } catch {
      // Try the compatibility path next.
    }
  }
  return false;
}

function validatedExplicitPlatformRoot(candidate) {
  if (!candidate) return null;
  if (!existsSync(join(candidate, "tools", "agent-workflow", "agent.ts"))) {
    console.error(
      `AGENT_PLATFORM_PATH is set but does not point to a Platform checkout with tools/developer-platform/agent-workflow/agent.ts: ${candidate}`,
    );
    process.exit(1);
  }
  if (!candidateSupportsRequiredCapabilities(candidate)) {
    console.error(
      `AGENT_PLATFORM_PATH is set but the selected Platform workflow is missing required capabilities: ${candidate}`,
    );
    process.exit(1);
  }
  return candidate;
}

const platformCandidates = [
  repoRoot,
  join(appCheckoutRoot, "..", "7steps-platform"),
  join(appCheckoutRoot, "..", "7steps-platform-stable"),
  join(appCheckoutRoot, "..", "platform"),
  "/Users/danielmatousek/Development/7steps/7steps-platform",
  ...existingAgentWorktrees(),
].filter(Boolean);

const platformRoots = platformCandidates.filter((candidate) =>
  existsSync(join(candidate, "tools", "agent-workflow", "agent.ts"))
);
const platformRoot =
  validatedExplicitPlatformRoot(explicitPlatformPath) ??
  platformRoots.find(candidateSupportsRequiredCapabilities) ??
  platformRoots[0];

if (!platformRoot) {
  console.error(
    "Could not find 7steps-platform agent workflow. Set AGENT_PLATFORM_PATH to the platform repo root.",
  );
  process.exit(1);
}

const agentPath = join(platformRoot, "tools", "agent-workflow", "agent.ts");
const repoPathEnvName = `AGENT_REPO_PATH_${repoKey.toUpperCase()}`;
const platformEnv = { ...process.env, [repoPathEnvName]: repoRoot };

function coordinatorAllowNetArg(env = process.env) {
  const hosts = new Set(["api.github.com", "api.linear.app", "uqekuinnltslfzahmffy.supabase.co", "127.0.0.1:8787", "localhost:8787"]);
  for (const name of ["AGENT_RUNTIME_COORDINATOR_URL", "AGENT_HARNESS_URL", "PLATFORM_AGENT_HARNESS_URL"]) {
    const value = env[name]?.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") hosts.add(url.host);
    } catch {
      // Runtime readiness reports malformed coordinator URLs.
    }
  }
  return "--allow-net=" + [...hosts].join(",");
}

function platformCommandForAppCommand(subcommand) {
  return subcommand === "merge-queue-gate" ? "gate" : subcommand;
}

function denoArgs(subcommand, extraArgs = []) {
  const platformCommand = platformCommandForAppCommand(subcommand);
  const platformArgs = subcommand === "merge-queue-gate"
    ? ["--check", "agent/merge-readiness", ...extraArgs]
    : extraArgs;
  return [
    "run",
    "--allow-run",
    "--allow-read",
    "--allow-write",
    "--allow-env",
    coordinatorAllowNetArg(platformEnv),
    agentPath,
    platformCommand,
    "--repo",
    repoKey,
    ...platformArgs,
  ];
}

function isDryRun(args) {
  return args.includes("--dry-run") || args.includes("--dry-run=true");
}

function hasSkipVisual(args) {
  return args.some((arg) => visualSkipFlags.has(arg));
}

function flagEnabled(args, name) {
  return args.includes(`--${name}`) || args.includes(`--${name}=true`);
}

function leaseRequiresWriteReadiness(args) {
  return [
    "acquire",
    "renew",
    "release",
    "force-release",
    "claim-paths",
    "release-paths",
  ].some((name) => flagEnabled(args, name));
}

function workspaceRequiresWriteReadiness(args) {
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    if (!arg.includes("=")) {
      const next = args[index + 1];
      if (next && !next.startsWith("--")) index += 1;
    }
  }
  const subcommand = positional[0];
  if (["list", "inspect", "audit", "triage-current"].includes(subcommand)) {
    return false;
  }
  if (subcommand === "cleanup") return flagEnabled(args, "apply");
  if (flagEnabled(args, "audit")) return false;
  return true;
}

function requiresWriteReadiness(command, args) {
  if (command === "secrets") return args[0] === "exec";
  if (command === "workspace") return workspaceRequiresWriteReadiness(args);
  if (command === "states") return flagEnabled(args, "repair");
  if (command === "router") return flagEnabled(args, "apply");
  if (command === "lease") return leaseRequiresWriteReadiness(args);
  return writeGatedCommands.has(command);
}

function requiresAppWorkflowConfig(command, args) {
  if (command === "secrets") return args[0] === "exec";
  return !diagnosticCommands.has(command);
}

function ticketFromArgs(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--ticket" || arg === "--issue") return args[index + 1] ?? null;
    if (arg.startsWith("--ticket=")) return arg.slice("--ticket=".length);
    if (arg.startsWith("--issue=")) return arg.slice("--issue=".length);
  }
  return null;
}

function printDoctorFailure(result) {
  try {
    const report = JSON.parse(result.stdout);
    if (report.missingCapabilities?.length) {
      console.error(
        `Selected Platform workflow at ${platformRoot} is missing required capabilities: ${report.missingCapabilities.join(", ")}`,
      );
    }
    if (report.contract?.passed === false) {
      console.error(
        `Selected Platform workflow reports a failing architecture contract for ${repoKey}.`,
      );
      for (const error of report.contract?.errors ?? []) {
        console.error(`- ${error}`);
      }
      for (const warning of report.contract?.warnings ?? []) {
        console.error(`- warning: ${warning}`);
      }
      console.error(
        "Check wrapper drift with: npm run agent:contract -- --check-wrapper",
      );
      console.error(
        "Preview generated wrapper repair with: npm run agent:contract -- --sync-wrapper --dry-run",
      );
    }
    const writeChecks = report.writeReadiness?.checks ?? [];
    const failingWriteChecks = writeChecks.filter((check) => check.status === "fail");
    const warningWriteChecks = writeChecks.filter((check) => check.status === "warn");
    if (failingWriteChecks.length) {
      console.error("Agent write-readiness failed:");
      for (const check of failingWriteChecks) {
        console.error(`- FAIL ${check.name}: ${check.message}`);
        if (check.remediation) console.error(`  remediation: ${check.remediation}`);
      }
    } else if (warningWriteChecks.length) {
      console.error("Agent write-readiness warnings:");
      for (const check of warningWriteChecks) {
        console.error(`- WARN ${check.name}: ${check.message}`);
        if (check.remediation) console.error(`  remediation: ${check.remediation}`);
      }
    }
  } catch {
    process.stderr.write(result.stderr || result.stdout);
  }
}

function assertWorkflowCapabilities({ requireWrites = false, writeCommand = command } = {}) {
  const doctorArgs = ["--json"];
  if (requireWrites) {
    doctorArgs.push("--require-writes", "--credential-command", writeCommand);
  }
  const result = spawnSync("deno", denoArgs("doctor", doctorArgs), {
    cwd: repoRoot,
    env: platformEnv,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    printDoctorFailure(result);
    process.exit(result.status ?? 1);
  }
  const report = JSON.parse(result.stdout);
  const missing = report.missingCapabilities ?? [];
  const missingRequired = requiredWorkflowCapabilities.filter(
    (capability) => report.workflow?.capabilities?.[capability] !== true,
  );
  const failures = [...new Set([...missing, ...missingRequired])];
  if (failures.length > 0) {
    console.error(
      `Selected Platform workflow at ${platformRoot} is missing required capabilities: ${failures.join(", ")}`,
    );
    process.exit(1);
  }
  if (!report.workflow?.supportedRepoKeys?.includes(repoKey)) {
    console.error(
      `Selected Platform workflow at ${platformRoot} does not support repo key ${repoKey}.`,
    );
    process.exit(1);
  }
  if (report.contract?.passed !== true) {
    console.error(
      `Selected Platform workflow reports a failing architecture contract for ${repoKey}.`,
    );
    for (const error of report.contract?.errors ?? []) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
  if (requireWrites && report.writeReadiness?.passed !== true) {
    printDoctorFailure(result);
    console.error(
      `Selected Platform workflow at ${platformRoot} cannot perform write operations from this shell. Run npm run agent:doctor -- --require-writes for details.`,
    );
    process.exit(1);
  }
}

if (requiresAppWorkflowConfig(command, passthrough)) {
  assertWorkflowCapabilities({
    requireWrites: command !== "secrets" &&
      requiresWriteReadiness(command, passthrough) &&
      (command === "workspace" || !isDryRun(passthrough)),
    writeCommand: platformCommandForAppCommand(command),
  });
}

const worktreePolicyPath = join(scriptDir, "lib", "worktree-policy.mjs");
if (existsSync(worktreePolicyPath) && requiresAppWorkflowConfig(command, passthrough)) {
  const policy = await import(pathToFileURL(worktreePolicyPath).href);
  policy.assertCanonicalWorktree?.({
    commandName: `agent:${command}`,
    neverAllowOverride: policy.nonOverridableCommands?.has?.(`agent:${command}`) ?? false,
  });
}

const visualQaPath = join(repoRoot, "scripts", "qa-visual.mjs");
if (command === "submit" && !isDryRun(passthrough) && !hasSkipVisual(rawPassthrough) && existsSync(visualQaPath)) {
  const ticket = ticketFromArgs(rawPassthrough);
  if (!ticket) {
    console.error("agent:submit requires --ticket <KEY> so qa:visual can enforce screenshot evidence.");
    process.exit(1);
  }
  const visualResult = spawnSync("node", [visualQaPath, "--ticket", ticket], {
    cwd: repoRoot,
    env: platformEnv,
    stdio: "inherit",
  });
  if (visualResult.error) {
    console.error(visualResult.error.message);
    process.exit(1);
  }
  if (visualResult.status !== 0) process.exit(visualResult.status ?? 1);
}

const secretsPath = join(platformRoot, "tools", "developer-platform", "agent-workflow", "secrets", "cli.ts");
const secretsPassthrough = passthrough.slice(1);
const secretsSeparatorIndex = secretsPassthrough.indexOf("--");
const secretsGatewayArgs = secretsSeparatorIndex === -1
  ? secretsPassthrough
  : secretsPassthrough.slice(0, secretsSeparatorIndex);
const hasExplicitSecretsRepo = secretsGatewayArgs.some((arg) =>
  arg === "--repo" || arg.startsWith("--repo=")
);
const invocation = command === "secrets"
  ? [
      "run",
      "--quiet",
      "--allow-run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-net=api.github.com,api.linear.app",
      secretsPath,
      passthrough[0],
      ...(hasExplicitSecretsRepo ? [] : ["--repo", repoKey]),
      ...secretsPassthrough,
    ]
  : denoArgs(command, passthrough);
const result = spawnSync("deno", invocation, {
  cwd: repoRoot,
  env: platformEnv,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
