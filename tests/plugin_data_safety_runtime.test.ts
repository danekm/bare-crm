import { assert, assertEquals } from "jsr:@std/assert"
import {
  createCrmAdmin,
  createCrmKernel,
  createExtensionHost,
  type CrmKernel,
  type GmailMessageSnapshot,
} from "../src/index.ts"
import {
  BARE_GMAIL_PLUGIN_ID,
  createBareGmailPluginRunner,
  installBareGmailPlugin,
} from "../src/adapters/gmail/mod.ts"
import {
  BARE_SUPABASE_USERS_PLUGIN_ID,
  createSupabaseUsersPluginRunner,
  installBareSupabaseUsersPlugin,
} from "../src/adapters/supabase-users/mod.ts"

const workspaceId = "workspace_1"

Deno.test("plugin data safety: Supabase secrets and raw user fields do not enter CRM records or events", async () => {
  const { crm, host } = setup()
  installBareSupabaseUsersPlugin(host, { workspaceId })
  await host.setPluginSecret({
    workspaceId,
    pluginId: BARE_SUPABASE_USERS_PLUGIN_ID,
    key: "supabase_url",
    value: "https://project.supabase.co",
  })
  await host.setPluginSecret({
    workspaceId,
    pluginId: BARE_SUPABASE_USERS_PLUGIN_ID,
    key: "supabase_service_role_key",
    value: "service_role_super_secret",
  })
  const runner = createSupabaseUsersPluginRunner({
    host,
    workspaceId,
    config: {
      table: "profiles",
      idColumn: "id",
      emailColumn: "email",
      nameColumn: "full_name",
      system: "app:analytics",
      adminUrlTemplate: "https://app.example.com/admin/users/{id}",
      traitColumns: {
        plan: "plan",
        status: "status",
      },
    },
    fetch: async () =>
      jsonResponse([{
        id: "user_123",
        email: "ada@example.com",
        full_name: "Ada Lovelace",
        plan: "pro",
        status: "active",
        password_hash: "hashed_password_should_not_be_stored",
        refresh_token: "refresh_token_should_not_be_stored",
        stripe_customer_id: "stripe_customer_should_not_be_stored",
        raw_user_meta_data: {
          home_address: "123 Private Street",
        },
      }]),
  })

  const result = await runner.linkPersonByEmail({ email: "ada@example.com" })

  assertEquals(result.status, "created")
  assert(result.person)
  assertEquals(result.person.custom?.appUsers, {
    "app:analytics": {
      userId: "user_123",
      email: "ada@example.com",
      name: "Ada Lovelace",
      url: "https://app.example.com/admin/users/user_123",
      traits: {
        plan: "pro",
        status: "active",
      },
    },
  })

  const serialized = await serializedCrmState(crm)
  assertDoesNotIncludeAny(serialized, [
    "service_role_super_secret",
    "hashed_password_should_not_be_stored",
    "refresh_token_should_not_be_stored",
    "stripe_customer_should_not_be_stored",
    "123 Private Street",
    "raw_user_meta_data",
  ])
})

Deno.test("plugin data safety: Gmail raw payload fields do not enter promoted CRM records", async () => {
  const { crm, host } = setup()
  installBareGmailPlugin(host, { workspaceId })
  const runner = createBareGmailPluginRunner({
    host,
    workspaceId,
    classifierSettings: { knownCustomerDomains: ["acme.com"] },
  })
  const message: GmailMessageSnapshot = {
    id: "msg_secret",
    threadId: "thread_secret",
    historyId: "hist_secret",
    subject: "Renewal pricing and next steps",
    snippet: "Can we review the pricing proposal and schedule a follow-up?",
    bodyText: "RAW_BODY_SECRET_REFRESH_TOKEN_SHOULD_NOT_BE_STORED",
    from: { email: "ada@acme.com", name: "Ada" },
    to: [{ email: "support@example.com" }],
    date: "2026-01-02T00:00:00.000Z",
    labelIds: ["RAW_LABEL_SECRET_SHOULD_NOT_BE_STORED"],
    headers: {
      Authorization: "Bearer gmail_header_secret_should_not_be_stored",
      "X-Provider-Payload": "raw_header_payload_should_not_be_stored",
    },
  }

  const result = await runner.processMessage({ message })

  assertEquals(result.action, "promoted")
  assertEquals(result.activity?.record.body, message.snippet)
  const serialized = await serializedCrmState(crm)
  assertDoesNotIncludeAny(serialized, [
    "RAW_BODY_SECRET_REFRESH_TOKEN_SHOULD_NOT_BE_STORED",
    "RAW_LABEL_SECRET_SHOULD_NOT_BE_STORED",
    "gmail_header_secret_should_not_be_stored",
    "raw_header_payload_should_not_be_stored",
    "Authorization",
    "X-Provider-Payload",
  ])
})

Deno.test("plugin data safety: plugin writes are auditable by actor and idempotency metadata", async () => {
  const { crm, host } = setup()
  installBareGmailPlugin(host, { workspaceId })
  installBareSupabaseUsersPlugin(host, { workspaceId })
  const gmail = createBareGmailPluginRunner({
    host,
    workspaceId,
    classifierSettings: { knownCustomerDomains: ["acme.com"] },
  })
  const supabase = createSupabaseUsersPluginRunner({
    host,
    workspaceId,
    directory: {
      async findByEmail(input) {
        return {
          system: "app:analytics",
          userId: "user_123",
          email: input.email,
          name: "Ada Lovelace",
        }
      },
    },
  })

  await gmail.processMessage({
    message: {
      id: "msg_1",
      threadId: "thread_1",
      subject: "Renewal pricing and next steps",
      snippet: "Can we review the pricing proposal and schedule a follow-up?",
      from: { email: "ada@acme.com", name: "Ada" },
      to: [{ email: "sales@example.com" }],
      date: "2026-01-02T00:00:00.000Z",
    },
  })
  await supabase.linkPersonByEmail({ email: "ada@example.com" })

  const admin = createCrmAdmin({ crm })
  const events = await admin.listEventMetadata({ workspaceId, limit: 20 })
  const gmailEvents = events.filter((event) => event.actorId === BARE_GMAIL_PLUGIN_ID)
  const supabaseEvents = events.filter((event) => event.actorId === BARE_SUPABASE_USERS_PLUGIN_ID)

  assertEquals(gmailEvents.length, 3)
  assertEquals(gmailEvents.every((event) => event.actorType === "plugin"), true)
  assertEquals(
    gmailEvents.map((event) => event.idempotencyKey).sort(),
    [
      "gmail:message:msg_1:activity",
      "gmail:message:msg_1:follow-up-task",
      "gmail:thread:thread_1:collection",
    ],
  )
  assertEquals(supabaseEvents.length, 1)
  assertEquals(supabaseEvents[0].actorType, "plugin")
  assertEquals(
    supabaseEvents[0].idempotencyKey,
    "supabase-users:person:app:analytics:user_123",
  )
})

async function serializedCrmState(crm: CrmKernel): Promise<string> {
  const records = await crm.read("record.search", {
    workspaceId,
    includeArchived: true,
    limit: 100,
  })
  const events = await crm.read("event.list", { workspaceId, limit: 100 })
  const adminEvents = await createCrmAdmin({ crm }).listEventMetadata({ workspaceId, limit: 100 })
  return JSON.stringify({ records, events, adminEvents })
}

function setup() {
  const crm = createCrmKernel({ now: fixedNow, id: sequenceId() })
  const host = createExtensionHost({ crm, now: fixedNow })
  return { crm, host }
}

function assertDoesNotIncludeAny(output: string, values: string[]): void {
  for (const value of values) {
    assertEquals(output.includes(value), false, `Expected output to omit private value: ${value}`)
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  })
}

function fixedNow(): Date {
  return new Date("2026-01-01T00:00:00.000Z")
}

function sequenceId(): () => string {
  let index = 0
  return () => `id_${++index}`
}
