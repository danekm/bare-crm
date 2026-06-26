import { assertEquals } from "jsr:@std/assert"
import { generateDocsSiteFiles } from "../tools/generate_docs_site.ts"

Deno.test("VitePress docs site is generated from canonical docs", async () => {
  for (const file of await generateDocsSiteFiles()) {
    assertEquals(await Deno.readTextFile(file.path), file.content, file.path)
  }
})
