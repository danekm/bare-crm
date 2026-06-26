import { assertEquals } from "jsr:@std/assert"

Deno.test("plugin data safety contract documents required safety boundaries", async () => {
  const text = await Deno.readTextFile("docs/plugin-data-safety.md")

  for (
    const phrase of [
      "Data Minimization",
      "Workspace Isolation",
      "Explicit Capabilities",
      "Secrets Stay Out Of CRM",
      "No Raw Provider Payloads",
      "Auditable Writes",
      "Idempotency And Dedupe",
      "Retention And Deletion",
      "Review Checklist",
    ]
  ) {
    assertEquals(text.includes(phrase), true, `Missing plugin data safety phrase: ${phrase}`)
  }
})

Deno.test("sensitive plugin docs link to the plugin data safety contract", async () => {
  const docs = [
    "docs/privacy-safety.md",
    "docs/plugin-development.md",
    "docs/app-user-lookup.md",
    "docs/gmail-plugin.md",
    "plugins/bare-gmail/README.md",
    "plugins/bare-google-tasks/README.md",
    "plugins/bare-granola/README.md",
    "plugins/bare-instagram/README.md",
    "plugins/bare-reddit/README.md",
    "plugins/bare-supabase-users/README.md",
  ]

  for (const path of docs) {
    const text = await Deno.readTextFile(path)
    assertEquals(
      text.includes("plugin-data-safety.md") || text.includes("Plugin Data Safety"),
      true,
      `${path} must link to Plugin Data Safety`,
    )
  }
})

Deno.test("sensitive plugin docs state no raw payload and secret storage posture", async () => {
  const gmail = await Deno.readTextFile("plugins/bare-gmail/README.md")
  const googleTasks = await Deno.readTextFile("plugins/bare-google-tasks/README.md")
  const granola = await Deno.readTextFile("plugins/bare-granola/README.md")
  const instagram = await Deno.readTextFile("plugins/bare-instagram/README.md")
  const reddit = await Deno.readTextFile("plugins/bare-reddit/README.md")
  const supabase = await Deno.readTextFile("plugins/bare-supabase-users/README.md")

  assertEquals(gmail.includes("workspace scope"), true)
  assertEquals(gmail.includes("minimization"), true)
  assertEquals(gmail.includes("no raw payload storage"), true)
  assertEquals(gmail.includes("OAuth tokens"), true)
  assertEquals(gmail.includes("idempotency"), true)

  assertEquals(googleTasks.includes("OAuth tokens"), true)
  assertEquals(googleTasks.includes("sync cursors"), true)
  assertEquals(googleTasks.includes("random personal Google tasks are ignored"), true)

  assertEquals(granola.includes("transcripts stay out of kernel records"), true)
  assertEquals(granola.includes("raw notes"), true)
  assertEquals(granola.includes("API secrets"), true)

  assertEquals(instagram.includes("workspace scope"), true)
  assertEquals(instagram.includes("minimization"), true)
  assertEquals(instagram.includes("no raw payload storage"), true)
  assertEquals(instagram.includes("OAuth tokens"), true)
  assertEquals(instagram.includes("idempotency"), true)

  assertEquals(reddit.includes("workspace scope"), true)
  assertEquals(reddit.includes("minimization"), true)
  assertEquals(reddit.includes("no raw payload storage"), true)
  assertEquals(reddit.includes("OAuth tokens"), true)
  assertEquals(reddit.includes("idempotency"), true)

  assertEquals(supabase.includes("workspace scope"), true)
  assertEquals(supabase.includes("minimization"), true)
  assertEquals(supabase.includes("no raw payload storage"), true)
  assertEquals(supabase.includes("supabase_service_role_key"), true)
  assertEquals(supabase.includes("idempotency"), true)
})
