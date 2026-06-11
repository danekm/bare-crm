import { assertEquals } from "jsr:@std/assert"
import { validatePluginManifest } from "../src/index.ts"

const hardRuleIds = [
  "HR-001",
  "HR-002",
  "HR-003",
  "HR-004",
  "HR-005",
  "HR-006",
  "HR-007",
  "HR-008",
  "HR-009",
  "HR-010",
]

Deno.test("hard rules are documented with stable rule ids", async () => {
  const text = await Deno.readTextFile("docs/hard-rules.md")

  for (const id of hardRuleIds) {
    assertEquals(text.includes(id), true, `Missing hard rule ${id}`)
  }

  assertEquals(text.includes("These are architecture invariants, not suggestions."), true)
  assertEquals(text.includes("Changing a hard rule requires:"), true)
})

Deno.test("public docs link to hard rules", async () => {
  const readme = await Deno.readTextFile("README.md")
  const architecture = await Deno.readTextFile("docs/architecture.md")
  const contributing = await Deno.readTextFile("CONTRIBUTING.md")

  assertEquals(readme.includes("docs/hard-rules.md"), true)
  assertEquals(architecture.includes("hard-rules.md"), true)
  assertEquals(contributing.includes("docs/hard-rules.md"), true)
})

Deno.test("example plugin manifests do not request storage capabilities", async () => {
  for await (const entry of Deno.readDir("examples/plugins")) {
    if (!entry.isFile || !entry.name.endsWith(".json")) continue

    const manifest = validatePluginManifest(
      JSON.parse(await Deno.readTextFile(`examples/plugins/${entry.name}`)),
    )

    assertEquals(
      manifest.capabilities.some((capability) => capability.startsWith("storage:")),
      false,
      `${entry.name} must not request direct storage access`,
    )
  }
})

Deno.test("hard rules state database creation must use official schema paths", async () => {
  const text = await Deno.readTextFile("docs/hard-rules.md")

  assertEquals(text.includes("Official Database Shape Only"), true)
  assertEquals(text.includes("official storage adapter schema helpers or migrations"), true)
  assertEquals(text.includes("installPostgresSchema"), true)
  assertEquals(text.includes("getPostgresSchemaSql"), true)
})
