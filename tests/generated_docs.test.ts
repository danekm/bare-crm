import { assertEquals } from "jsr:@std/assert"
import { renderPluginSafetyCoverage } from "../tools/generate_plugin_safety_docs.ts"

Deno.test("generated plugin safety coverage docs are current", async () => {
  assertEquals(
    compactWhitespace(await Deno.readTextFile("docs/generated/plugin-safety-coverage.md")),
    compactWhitespace(renderPluginSafetyCoverage()),
  )
})

function compactWhitespace(value: string): string {
  return value
    .replace(/\| -+ \| -+ \| -+ \| -+ \|/g, "| --- | --- | --- | --- |")
    .replace(/\s+/g, " ")
    .trim()
}
