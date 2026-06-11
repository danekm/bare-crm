import { assert, assertEquals, assertRejects } from "jsr:@std/assert"
import {
  createCrmKernel,
  createExtensionHost,
  type CrmKernel,
  ExtensionHostError,
  type Person,
} from "../src/index.ts"
import {
  type AppUserDirectory,
  BARE_SUPABASE_USERS_PLUGIN_ID,
  BARE_SUPABASE_USERS_REQUIRED_CAPABILITIES,
  BareSupabaseUsersPluginError,
  bareSupabaseUsersPluginManifest,
  createSupabaseAppUserDirectory,
  createSupabaseUsersPluginRunner,
  installBareSupabaseUsersPlugin,
} from "../plugins/bare-supabase-users/mod.ts"

const workspaceId = "workspace_1"

const directory: AppUserDirectory = {
  async findByEmail(input) {
    if (input.email !== "ada@example.com") return null
    return {
      system: "app:analytics",
      userId: "user_123",
      email: input.email,
      name: "Ada Lovelace",
      url: "https://app.example.com/admin/users/user_123",
      traits: {
        plan: "pro",
        status: "active",
      },
    }
  },
}

Deno.test("Bare Supabase Users plugin manifest is valid and installable per workspace", () => {
  const { host } = setup()

  const state = installBareSupabaseUsersPlugin(host, { workspaceId })

  assertEquals(bareSupabaseUsersPluginManifest.id, BARE_SUPABASE_USERS_PLUGIN_ID)
  assertEquals(state.pluginId, BARE_SUPABASE_USERS_PLUGIN_ID)
  assertEquals(state.approvedCapabilities, BARE_SUPABASE_USERS_REQUIRED_CAPABILITIES)
})

Deno.test("Supabase Users runner finds app users through an injected directory", async () => {
  const { host } = setup()
  installBareSupabaseUsersPlugin(host, { workspaceId })
  const runner = createSupabaseUsersPluginRunner({ host, workspaceId, directory })

  assertEquals(await runner.findByEmail({ email: "ADA@example.com " }), {
    system: "app:analytics",
    userId: "user_123",
    email: "ada@example.com",
    name: "Ada Lovelace",
    url: "https://app.example.com/admin/users/user_123",
    traits: {
      plan: "pro",
      status: "active",
    },
  })
  assertEquals(await runner.findByEmail({ email: "missing@example.com" }), null)
})

Deno.test("Supabase Users runner creates and then reuses linked CRM people", async () => {
  const { crm, host } = setup()
  installBareSupabaseUsersPlugin(host, { workspaceId })
  const runner = createSupabaseUsersPluginRunner({ host, workspaceId, directory })

  const first = await runner.linkPersonByEmail({ email: "ada@example.com" })

  assertEquals(first.status, "created")
  assert(first.person)
  assertEquals(first.person.name, "Ada Lovelace")
  assertEquals(first.person.emails, [{ value: "ada@example.com", primary: true }])
  assertEquals(first.person.externalRefs, [{
    system: "app:analytics",
    id: "user_123",
    url: "https://app.example.com/admin/users/user_123",
    kind: "canonical",
  }])
  assertEquals(first.person.custom?.appUsers, {
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

  const second = await runner.linkPersonByEmail({ email: "ada@example.com" })

  assertEquals(second.status, "matched")
  assert(second.person)
  assertEquals(second.person.id, first.person.id)
  assertEquals(await countPeople(crm), 1)
})

Deno.test("Supabase Users runner updates an existing person matched by email", async () => {
  const { crm, host } = setup()
  installBareSupabaseUsersPlugin(host, { workspaceId })
  const existing = await crm.write("person.create", {
    workspaceId,
    id: "person_existing",
    name: "Ada",
    emails: [{ value: "ada@example.com", primary: true }],
  })
  const runner = createSupabaseUsersPluginRunner({ host, workspaceId, directory })

  const result = await runner.linkPersonByEmail({ email: "ada@example.com" })

  assertEquals(result.status, "updated")
  assert(result.person)
  assertEquals(result.person.id, existing.id)
  assertEquals(result.person.externalRefs?.[0].system, "app:analytics")
  assertEquals(result.person.externalRefs?.[0].id, "user_123")
  assertEquals(await countPeople(crm), 1)
})

Deno.test("Supabase Users runner cannot lookup without network approval", async () => {
  const { host } = setup()
  installBareSupabaseUsersPlugin(host, {
    workspaceId,
    approvedCapabilities: ["plugin:commands"],
  })
  const runner = createSupabaseUsersPluginRunner({ host, workspaceId, directory })

  await assertRejects(
    () => runner.findByEmail({ email: "ada@example.com" }),
    BareSupabaseUsersPluginError,
    "network:external",
  )
})

Deno.test("Supabase Users runner cannot link people without CRM write approval", async () => {
  const { host } = setup()
  installBareSupabaseUsersPlugin(host, {
    workspaceId,
    approvedCapabilities: ["plugin:commands", "network:external"],
  })
  const runner = createSupabaseUsersPluginRunner({ host, workspaceId, directory })

  await assertRejects(
    () => runner.linkPersonByEmail({ email: "ada@example.com" }),
    ExtensionHostError,
    "not approved",
  )
})

Deno.test("Supabase REST directory maps configured user rows", async () => {
  let requestedUrl = ""
  let requestedAuthorization = ""
  const directory = createSupabaseAppUserDirectory({
    config: {
      url: "https://example.supabase.co",
      serviceRoleKey: "service_role",
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
    fetch: async (url, init) => {
      requestedUrl = String(url)
      requestedAuthorization = String(new Headers(init?.headers).get("authorization"))
      return jsonResponse([{
        id: "user_123",
        email: "ADA@example.com",
        full_name: "Ada Lovelace",
        plan: "pro",
        status: "active",
      }])
    },
  })

  const result = await directory.findByEmail({ workspaceId, email: "ADA@example.com" })

  assertEquals(requestedUrl.includes("/rest/v1/profiles"), true)
  assertEquals(requestedUrl.includes("email=eq.ada%40example.com"), true)
  assertEquals(requestedUrl.includes("select=id%2Cemail%2Cfull_name%2Cplan%2Cstatus"), true)
  assertEquals(requestedAuthorization, "Bearer service_role")
  assertEquals(result, {
    system: "app:analytics",
    userId: "user_123",
    email: "ada@example.com",
    name: "Ada Lovelace",
    url: "https://app.example.com/admin/users/user_123",
    traits: {
      plan: "pro",
      status: "active",
    },
  })
})

function setup() {
  const crm = createCrmKernel({ now: fixedNow, id: sequenceId() })
  const host = createExtensionHost({ crm, now: fixedNow })
  return { crm, host }
}

async function countPeople(crm: CrmKernel): Promise<number> {
  return (await crm.read("record.search", { workspaceId, type: "person" })).length
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
