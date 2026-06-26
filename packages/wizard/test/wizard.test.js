import assert from "node:assert/strict"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { createProject, normalizeCommand, projectFiles } from "../src/index.js"

test("normalizeCommand defaults to init with sqlite storage", () => {
  assert.deepEqual(normalizeCommand([]), {
    dir: ".",
    dryRun: false,
    force: false,
    name: undefined,
    storage: "sqlite",
  })
})

test("normalizeCommand accepts an init directory and memory storage", () => {
  assert.deepEqual(
    normalizeCommand(["init", "demo", "--storage", "memory", "--name", "Demo CRM"]),
    {
      dir: "demo",
      dryRun: false,
      force: false,
      name: "Demo CRM",
      storage: "memory",
    },
  )
})

test("projectFiles creates a sqlite starter with kernel imports", () => {
  const files = projectFiles({ projectName: "demo", storage: "sqlite" })
  const main = files.find((file) => file.path === "main.ts")?.contents ?? ""
  const denoJson = files.find((file) => file.path === "deno.json")?.contents ?? ""

  assert.match(main, /createSqliteStorage/)
  assert.match(main, /person\.create/)
  assert.match(denoJson, /@bare-crm\/kernel/)
  assert.match(denoJson, /db:migrate/)
})

test("createProject writes a small starter project", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "bare-crm-wizard-"))
  const writes = []

  try {
    await createProject({
      cwd: tmp,
      dir: "demo",
      name: "Demo CRM",
      storage: "memory",
      stdout: { write: (text) => writes.push(text) },
    })

    const entries = await readdir(path.join(tmp, "demo"))
    assert.deepEqual(entries.sort(), [".gitignore", "README.md", "deno.json", "main.ts"])

    const denoJson = JSON.parse(await readFile(path.join(tmp, "demo", "deno.json"), "utf8"))
    assert.equal(denoJson.name, "demo-crm")
    assert.equal(denoJson.tasks["db:migrate"], undefined)
    assert.match(writes.join(""), /Bare CRM starter created/)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})

test("createProject refuses a non-empty directory unless forced", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "bare-crm-wizard-"))

  try {
    await createProject({ cwd: tmp, dir: "demo", storage: "memory", stdout: { write() {} } })
    await assert.rejects(
      createProject({ cwd: tmp, dir: "demo", storage: "memory", stdout: { write() {} } }),
      /not empty/,
    )
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})
