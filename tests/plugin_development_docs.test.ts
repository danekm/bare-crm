import { assertEquals } from "jsr:@std/assert"

Deno.test("plugin development guide documents the public authoring path", async () => {
  const text = await Deno.readTextFile("docs/plugin-development.md")

  for (
    const phrase of [
      "declare the plugin with a manifest",
      "read through the Read API",
      "mutate through the Write API",
      "keep plugin state outside kernel tables",
      "Plugins never access the Storage API or database directly.",
      "validatePluginManifest",
      "createPluginExecutionContext",
      "Plugin tests should live with the plugin package.",
    ]
  ) {
    assertEquals(text.includes(phrase), true, `Missing plugin development phrase: ${phrase}`)
  }
})

Deno.test("public docs link to the plugin development guide", async () => {
  const readme = await Deno.readTextFile("README.md")
  const plugins = await Deno.readTextFile("docs/plugins.md")
  const openSource = await Deno.readTextFile("docs/open-source.md")

  assertEquals(readme.includes("docs/plugin-development.md"), true)
  assertEquals(plugins.includes("plugin-development.md"), true)
  assertEquals(openSource.includes("docs/plugin-development.md"), true)
})
