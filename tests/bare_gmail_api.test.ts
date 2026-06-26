import { assertEquals, assertRejects } from "jsr:@std/assert"
import {
  BareGmailApiTransportError,
  type BareGmailFetch,
  createGmailApiSyncTransport,
  createGmailRefreshAccessTokenProvider,
  refreshBareGmailAccessToken,
  watchBareGmailMailbox,
} from "../src/adapters/gmail/mod.ts"

const workspaceId = "workspace_1"

Deno.test("Bare Gmail API transport lists Gmail history and fetches message metadata", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const transport = createGmailApiSyncTransport({
    apiBaseUrl: "https://gmail.test/gmail/v1",
    accessToken: async () => "access_token_1",
    fetch: fakeFetch(calls, {
      "/gmail/v1/users/me/history": {
        historyId: "hist_2",
        history: [{
          messagesAdded: [{
            message: { id: "msg_1", threadId: "thread_1" },
          }],
        }],
      },
      "/gmail/v1/users/me/messages/msg_1": {
        id: "msg_1",
        threadId: "thread_1",
        historyId: "hist_2",
        internalDate: "1760000000000",
        labelIds: ["INBOX"],
        snippet: "Can we review pricing?",
        payload: {
          headers: [
            { name: "From", value: "Ada <ada@acme.com>" },
            { name: "To", value: "sales@example.com" },
            { name: "Subject", value: "Pricing" },
            { name: "Date", value: "2026-01-02T00:00:00.000Z" },
          ],
        },
      },
    }),
  })

  const result = await transport.listChangedMessages({
    workspaceId,
    cursor: "hist_1",
    limit: 10,
  })

  assertEquals(result.nextCursor, "hist_2")
  assertEquals(result.messages, [{
    id: "msg_1",
    threadId: "thread_1",
    historyId: "hist_2",
    subject: "Pricing",
    snippet: "Can we review pricing?",
    from: { name: "Ada", email: "ada@acme.com" },
    to: [{ email: "sales@example.com" }],
    cc: undefined,
    date: "2026-01-02T00:00:00.000Z",
    internalDate: "1760000000000",
    labelIds: ["INBOX"],
    headers: {
      from: "Ada <ada@acme.com>",
      to: "sales@example.com",
      subject: "Pricing",
      date: "2026-01-02T00:00:00.000Z",
    },
  }])
  assertEquals(new URL(calls[0].url).searchParams.get("startHistoryId"), "hist_1")
  assertEquals(new URL(calls[0].url).searchParams.get("historyTypes"), "messageAdded")
  assertEquals(calls[0].init?.headers instanceof Headers, true)
  assertEquals((calls[0].init?.headers as Headers).get("authorization"), "Bearer access_token_1")
  assertEquals(new URL(calls[1].url).searchParams.get("format"), "METADATA")
})

Deno.test("Bare Gmail API transport can seed history sync from initialHistoryId", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const transport = createGmailApiSyncTransport({
    apiBaseUrl: "https://gmail.test/gmail/v1",
    initialHistoryId: "hist_seed",
    accessToken: async () => "access_token_1",
    fetch: fakeFetch(calls, {
      "/gmail/v1/users/me/history": {
        historyId: "hist_seed",
        history: [],
      },
    }),
  })

  const result = await transport.listChangedMessages({ workspaceId })

  assertEquals(result.messages, [])
  assertEquals(result.nextCursor, "hist_seed")
  assertEquals(new URL(calls[0].url).searchParams.get("startHistoryId"), "hist_seed")
})

Deno.test("Bare Gmail API transport requires cursor or initialHistoryId", async () => {
  const transport = createGmailApiSyncTransport({
    accessToken: async () => "access_token_1",
    fetch: fakeFetch([], {}),
  })

  await assertRejects(
    () => transport.listChangedMessages({ workspaceId }),
    BareGmailApiTransportError,
    "cursor",
  )
})

Deno.test("Bare Gmail API watch posts Pub/Sub topic request", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []

  const result = await watchBareGmailMailbox({
    apiBaseUrl: "https://gmail.test/gmail/v1",
    accessToken: async () => "access_token_1",
    fetch: fakeFetch(calls, {
      "/gmail/v1/users/me/watch": {
        historyId: "hist_9",
        expiration: "1760000000000",
      },
    }),
  }, {
    workspaceId,
    topicName: "projects/example/topics/gmail",
    labelIds: ["INBOX"],
    labelFilterBehavior: "INCLUDE",
  })

  assertEquals(result, {
    historyId: "hist_9",
    expiration: "1760000000000",
  })
  assertEquals(calls[0].init?.method, "POST")
  assertEquals(JSON.parse(String(calls[0].init?.body)), {
    topicName: "projects/example/topics/gmail",
    labelIds: ["INBOX"],
    labelFilterBehavior: "INCLUDE",
  })
})

Deno.test("Bare Gmail OAuth refresh resolves secret refs and returns access token", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const secrets: Record<string, string> = {
    "secret://gmail/client-id": "client_id_1",
    "secret://gmail/client-secret": "client_secret_1",
    "secret://gmail/refresh-token": "refresh_token_1",
  }

  const result = await refreshBareGmailAccessToken({
    clientIdRef: "secret://gmail/client-id",
    clientSecretRef: "secret://gmail/client-secret",
    refreshTokenRef: "secret://gmail/refresh-token",
    resolveSecret: async (ref) => secrets[ref],
    tokenUrl: "https://oauth.test/token",
    fetch: fakeFetch(calls, {
      "/token": {
        access_token: "access_token_2",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/gmail.metadata",
        token_type: "Bearer",
      },
    }),
  })
  const provider = createGmailRefreshAccessTokenProvider({
    clientIdRef: "secret://gmail/client-id",
    clientSecretRef: "secret://gmail/client-secret",
    refreshTokenRef: "secret://gmail/refresh-token",
    resolveSecret: async (ref) => secrets[ref],
    tokenUrl: "https://oauth.test/token",
    fetch: fakeFetch([], {
      "/token": {
        access_token: "access_token_3",
      },
    }),
  })

  assertEquals(result, {
    accessToken: "access_token_2",
    expiresIn: 3600,
    scope: "https://www.googleapis.com/auth/gmail.metadata",
    tokenType: "Bearer",
  })
  assertEquals(calls[0].init?.method, "POST")
  assertEquals((calls[0].init?.headers as Headers).get("authorization"), null)
  assertEquals(
    String(calls[0].init?.body),
    [
      "client_id=client_id_1",
      "client_secret=client_secret_1",
      "refresh_token=refresh_token_1",
      "grant_type=refresh_token",
    ].join("&"),
  )
  assertEquals(await provider({ workspaceId }), "access_token_3")
})

function fakeFetch(
  calls: Array<{ url: string; init?: RequestInit }>,
  responses: Record<string, unknown>,
): BareGmailFetch {
  return async (input, init) => {
    const url = String(input)
    calls.push({ url, init })
    const path = new URL(url).pathname
    if (!(path in responses)) return new Response("not found", { status: 404 })
    return Response.json(responses[path])
  }
}
