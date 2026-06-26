import { existsSync } from "node:fs"
import { mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

const packageVersion = "0.1.0"
const defaultKernelVersion = "^0.1.0"
const supportedStorage = new Set(["sqlite", "memory"])

export async function runCli(argv, io = {}) {
  const command = normalizeCommand(argv)

  if (command.help) {
    write(io.stdout, helpText())
    return 0
  }

  if (command.version) {
    write(io.stdout, `@bare-crm/wizard ${packageVersion}\n`)
    return 0
  }

  await createProject({
    cwd: io.cwd ?? process.cwd(),
    dir: command.dir,
    force: command.force,
    dryRun: command.dryRun,
    name: command.name,
    storage: command.storage,
    stdout: io.stdout,
  })

  return 0
}

export function normalizeCommand(argv) {
  const args = [...argv]
  const command = args[0] && !args[0].startsWith("-") ? args.shift() : "init"

  if (command === "help" || args.includes("--help") || args.includes("-h")) {
    return { help: true }
  }

  if (command === "version" || args.includes("--version") || args.includes("-v")) {
    return { version: true }
  }

  if (command !== "init") {
    throw new Error(`Unknown command: ${command}`)
  }

  const parsed = {
    dir: ".",
    dryRun: false,
    force: false,
    name: undefined,
    storage: "sqlite",
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--dry-run") {
      parsed.dryRun = true
      continue
    }
    if (arg === "--force") {
      parsed.force = true
      continue
    }
    if (arg === "--name") {
      parsed.name = readOptionValue(args, index, "--name")
      index += 1
      continue
    }
    if (arg === "--storage") {
      parsed.storage = readOptionValue(args, index, "--storage")
      index += 1
      continue
    }
    if (arg.startsWith("--name=")) {
      parsed.name = arg.slice("--name=".length)
      continue
    }
    if (arg.startsWith("--storage=")) {
      parsed.storage = arg.slice("--storage=".length)
      continue
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`)
    }
    if (parsed.dir !== ".") {
      throw new Error(`Unexpected argument: ${arg}`)
    }
    parsed.dir = arg
  }

  if (!supportedStorage.has(parsed.storage)) {
    throw new Error(`Unsupported storage: ${parsed.storage}. Use sqlite or memory.`)
  }

  return parsed
}

export async function createProject(options) {
  const cwd = options.cwd ?? process.cwd()
  const targetDir = path.resolve(cwd, options.dir ?? ".")
  const projectName = sanitizeProjectName(
    options.name ?? path.basename(targetDir) ?? "bare-crm-app",
  )
  const storage = options.storage ?? "sqlite"
  const files = projectFiles({ projectName, storage })

  if (!options.dryRun) {
    await assertWritableTarget(targetDir, Boolean(options.force))
    await mkdir(targetDir, { recursive: true })

    await Promise.all(
      files.map((file) => writeFile(path.join(targetDir, file.path), file.contents, "utf8")),
    )
  }

  write(
    options.stdout,
    successText({ targetDir, projectName, storage, files, dryRun: options.dryRun }),
  )

  return { targetDir, projectName, storage, files }
}

export function projectFiles({ projectName, storage }) {
  return [
    {
      path: "deno.json",
      contents: `${JSON.stringify(denoConfig(projectName, storage), null, 2)}\n`,
    },
    {
      path: "main.ts",
      contents: storage === "memory" ? memoryStarter() : sqliteStarter(),
    },
    {
      path: ".gitignore",
      contents: gitignore(),
    },
    {
      path: "README.md",
      contents: starterReadme(projectName, storage),
    },
  ]
}

function denoConfig(projectName, storage) {
  const tasks = {
    dev: "deno run --allow-read --allow-write --allow-env --allow-ffi main.ts",
    check: "deno check main.ts",
    fmt: "deno fmt",
  }

  if (storage === "sqlite") {
    tasks["db:status"] =
      `deno run --allow-read --allow-write --allow-env --allow-ffi jsr:@bare-crm/kernel@${defaultKernelVersion}/cli db status sqlite ./bare-crm.db`
    tasks["db:migrate"] =
      `deno run --allow-read --allow-write --allow-env --allow-ffi jsr:@bare-crm/kernel@${defaultKernelVersion}/cli db migrate sqlite ./bare-crm.db`
  }

  return {
    name: projectName,
    tasks,
    imports: {
      "@bare-crm/kernel": `jsr:@bare-crm/kernel@${defaultKernelVersion}`,
      "@bare-crm/kernel/": `jsr:@bare-crm/kernel@${defaultKernelVersion}/`,
    },
  }
}

function sqliteStarter() {
  return `import { createCrmKernel } from "@bare-crm/kernel"
import { createSqliteStorage } from "@bare-crm/kernel/sqlite"

const workspaceId = "workspace_1"
const storage = createSqliteStorage("./bare-crm.db")
const crm = createCrmKernel({ storage })

try {
  const person = await crm.write("person.create", {
    workspaceId,
    name: "Ada Lovelace",
    emails: [{ value: "ada@example.com", primary: true }],
    source: "manual",
  })

  const people = await crm.read("record.search", {
    workspaceId,
    type: "person",
    text: "ada",
  })

  console.log(JSON.stringify({ created: person, matches: people.length }, null, 2))
} finally {
  storage.close()
}
`
}

function memoryStarter() {
  return `import { createCrmKernel } from "@bare-crm/kernel"

const workspaceId = "workspace_1"
const crm = createCrmKernel()

const person = await crm.write("person.create", {
  workspaceId,
  name: "Ada Lovelace",
  emails: [{ value: "ada@example.com", primary: true }],
  source: "manual",
})

const people = await crm.read("record.search", {
  workspaceId,
  type: "person",
  text: "ada",
})

console.log(JSON.stringify({ created: person, matches: people.length }, null, 2))
`
}

function starterReadme(projectName, storage) {
  const storageLine = storage === "sqlite"
    ? "This starter uses SQLite storage and writes to `./bare-crm.db`."
    : "This starter uses in-memory storage for quick experiments."

  const sqliteTasks = storage === "sqlite"
    ? `
Check or migrate the database explicitly:

\`\`\`sh
deno task db:status
deno task db:migrate
\`\`\`
`
    : ""

  return `# ${projectName}

Small Bare CRM starter generated by \`@bare-crm/wizard\`.

${storageLine}

Run it:

\`\`\`sh
deno task dev
\`\`\`
${sqliteTasks}
Useful next steps:

- edit \`main.ts\`
- run \`deno task check\`
- add host-owned auth, UI, or workflow layers outside the kernel
`
}

function gitignore() {
  return `bare-crm.db
.env
.DS_Store
`
}

async function assertWritableTarget(targetDir, force) {
  if (!existsSync(targetDir)) return

  const entries = await readdir(targetDir)
  if (entries.length > 0 && !force) {
    throw new Error(`Target directory is not empty: ${targetDir}. Use --force to write anyway.`)
  }
}

function sanitizeProjectName(value) {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return sanitized || "bare-crm-app"
}

function readOptionValue(args, index, option) {
  const value = args[index + 1]
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}`)
  }
  return value
}

function successText({ targetDir, projectName, storage, files, dryRun }) {
  const relativeTarget = path.relative(process.cwd(), targetDir) || "."
  const prefix = dryRun ? "Bare CRM wizard dry run" : "Bare CRM starter created"
  const fileList = files.map((file) => `  - ${file.path}`).join("\n")

  return `${prefix}: ${relativeTarget}

Project: ${projectName}
Storage: ${storage}

Files:
${fileList}

Next:
  cd ${relativeTarget}
  deno task dev
`
}

function helpText() {
  return `Bare CRM wizard

Usage:
  npx -y @bare-crm/wizard@latest init [directory] [options]

Options:
  --storage sqlite|memory   Starter storage adapter. Defaults to sqlite.
  --name <name>             Project name for deno.json. Defaults to directory name.
  --dry-run                 Print what would be created without writing files.
  --force                   Allow writing into a non-empty directory.
  -h, --help                Show this help.
  -v, --version             Show the wizard version.
`
}

function write(stream, text) {
  if (stream?.write) stream.write(text)
}
