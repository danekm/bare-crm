import type { GmailAddress, GmailMessageSnapshot } from "../../index.ts"
import type {
  BareGmailListChangedMessagesInput,
  BareGmailSyncBatch,
  BareGmailSyncTransport,
} from "./sync.ts"

export type BareGmailAccessTokenProvider = (input: {
  workspaceId: string
}) => Promise<string>

export type BareGmailSecretResolver = (ref: string) => Promise<string>

export type BareGmailFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>

export type BareGmailApiTransportOptions = {
  accessToken: BareGmailAccessTokenProvider
  fetch?: BareGmailFetch
  userId?: string
  initialHistoryId?: string
  apiBaseUrl?: string
  metadataHeaders?: string[]
}

export type BareGmailWatchInput = {
  workspaceId: string
  topicName: string
  labelIds?: string[]
  labelFilterBehavior?: "INCLUDE" | "EXCLUDE"
}

export type BareGmailWatchResult = {
  historyId: string
  expiration?: string
}

export type BareGmailTokenRefreshOptions = {
  clientIdRef: string
  clientSecretRef: string
  refreshTokenRef: string
  resolveSecret: BareGmailSecretResolver
  fetch?: BareGmailFetch
  tokenUrl?: string
}

export type BareGmailTokenRefreshResult = {
  accessToken: string
  expiresIn?: number
  scope?: string
  tokenType?: string
}

export class BareGmailApiTransportError extends Error {
  constructor(
    readonly code:
      | "gmail.cursor_required"
      | "gmail.api_error"
      | "gmail.invalid_response",
    message: string,
  ) {
    super(message)
    this.name = "BareGmailApiTransportError"
  }
}

type GmailTokenResponse = {
  access_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

type GmailHistoryListResponse = {
  history?: Array<{
    messages?: Array<GmailMessageRef>
    messagesAdded?: Array<{ message?: GmailMessageRef }>
  }>
  nextPageToken?: string
  historyId?: string
}

type GmailMessageRef = {
  id?: string
  threadId?: string
}

type GmailApiMessage = {
  id?: string
  threadId?: string
  historyId?: string
  internalDate?: string
  labelIds?: string[]
  snippet?: string
  payload?: {
    headers?: Array<{ name?: string; value?: string }>
  }
}

export function createGmailApiSyncTransport(
  options: BareGmailApiTransportOptions,
): BareGmailSyncTransport {
  const apiFetch = options.fetch ?? fetch
  const apiBaseUrl = options.apiBaseUrl ?? "https://gmail.googleapis.com/gmail/v1"
  const userId = options.userId ?? "me"
  const metadataHeaders = options.metadataHeaders ?? [
    "From",
    "To",
    "Cc",
    "Subject",
    "Date",
    "List-Unsubscribe",
  ]

  return {
    async listChangedMessages(input) {
      const accessToken = await options.accessToken({ workspaceId: input.workspaceId })
      const startHistoryId = input.cursor ?? options.initialHistoryId
      if (!startHistoryId) {
        throw new BareGmailApiTransportError(
          "gmail.cursor_required",
          "Gmail history sync requires a cursor or initialHistoryId.",
        )
      }

      const messageIds = new Map<string, GmailMessageRef>()
      let nextPageToken: string | undefined
      let responseHistoryId: string | undefined

      do {
        const history = await requestJson<GmailHistoryListResponse>({
          fetch: apiFetch,
          accessToken,
          url: gmailHistoryUrl({
            apiBaseUrl,
            userId,
            startHistoryId,
            pageToken: nextPageToken,
            maxResults: input.limit,
          }),
        })
        responseHistoryId = history.historyId ?? responseHistoryId
        collectMessageRefs(history).forEach((message) => {
          if (message.id) messageIds.set(message.id, message)
        })
        nextPageToken = history.nextPageToken
      } while (nextPageToken && (!input.limit || messageIds.size < input.limit))

      const limitedIds = [...messageIds.values()].slice(0, input.limit)
      const messages = await Promise.all(limitedIds.map((message) =>
        fetchMessageSnapshot({
          fetch: apiFetch,
          accessToken,
          apiBaseUrl,
          userId,
          messageId: requireMessageId(message),
          metadataHeaders,
        })
      ))

      return {
        messages,
        nextCursor: responseHistoryId ?? input.cursor,
      } satisfies BareGmailSyncBatch
    },
  }
}

export function createGmailRefreshAccessTokenProvider(
  options: BareGmailTokenRefreshOptions,
): BareGmailAccessTokenProvider {
  return async () => {
    const result = await refreshBareGmailAccessToken(options)
    return result.accessToken
  }
}

export async function refreshBareGmailAccessToken(
  options: BareGmailTokenRefreshOptions,
): Promise<BareGmailTokenRefreshResult> {
  const apiFetch = options.fetch ?? fetch
  const tokenUrl = options.tokenUrl ?? "https://oauth2.googleapis.com/token"
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    options.resolveSecret(options.clientIdRef),
    options.resolveSecret(options.clientSecretRef),
    options.resolveSecret(options.refreshTokenRef),
  ])
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  })
  const response = await requestJson<GmailTokenResponse>({
    fetch: apiFetch,
    accessToken: "",
    url: tokenUrl,
    init: {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
    omitAuthorization: true,
  })
  if (!response.access_token) {
    throw new BareGmailApiTransportError(
      "gmail.invalid_response",
      "Google OAuth token response did not include access_token.",
    )
  }

  return {
    accessToken: response.access_token,
    expiresIn: response.expires_in,
    scope: response.scope,
    tokenType: response.token_type,
  }
}

export async function watchBareGmailMailbox(
  options: BareGmailApiTransportOptions,
  input: BareGmailWatchInput,
): Promise<BareGmailWatchResult> {
  const apiFetch = options.fetch ?? fetch
  const apiBaseUrl = options.apiBaseUrl ?? "https://gmail.googleapis.com/gmail/v1"
  const userId = options.userId ?? "me"
  const accessToken = await options.accessToken({ workspaceId: input.workspaceId })
  const response = await requestJson<BareGmailWatchResult>({
    fetch: apiFetch,
    accessToken,
    url: `${apiBaseUrl}/users/${encodeURIComponent(userId)}/watch`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topicName: input.topicName,
        labelIds: input.labelIds,
        labelFilterBehavior: input.labelFilterBehavior,
      }),
    },
  })
  if (!response.historyId) {
    throw new BareGmailApiTransportError(
      "gmail.invalid_response",
      "Gmail watch response did not include historyId.",
    )
  }
  return response
}

async function fetchMessageSnapshot(input: {
  fetch: BareGmailFetch
  accessToken: string
  apiBaseUrl: string
  userId: string
  messageId: string
  metadataHeaders: string[]
}): Promise<GmailMessageSnapshot> {
  const message = await requestJson<GmailApiMessage>({
    fetch: input.fetch,
    accessToken: input.accessToken,
    url: gmailMessageUrl(input),
  })
  if (!message.id || !message.threadId) {
    throw new BareGmailApiTransportError(
      "gmail.invalid_response",
      "Gmail message response did not include id and threadId.",
    )
  }

  const headers = gmailHeaders(message)
  return {
    id: message.id,
    threadId: message.threadId,
    historyId: message.historyId,
    subject: headers.subject,
    snippet: message.snippet,
    from: parseAddress(headers.from),
    to: parseAddressList(headers.to),
    cc: parseAddressList(headers.cc),
    date: headers.date,
    internalDate: message.internalDate,
    labelIds: message.labelIds,
    headers,
  }
}

async function requestJson<T>(input: {
  fetch: BareGmailFetch
  accessToken: string
  url: string
  init?: RequestInit
  omitAuthorization?: boolean
}): Promise<T> {
  const headers = new Headers(input.init?.headers)
  if (!input.omitAuthorization) {
    headers.set("authorization", `Bearer ${input.accessToken}`)
  }
  const response = await input.fetch(input.url, {
    ...input.init,
    headers,
  })
  if (!response.ok) {
    throw new BareGmailApiTransportError(
      "gmail.api_error",
      `Gmail API request failed with HTTP ${response.status}`,
    )
  }
  return await response.json() as T
}

function gmailHistoryUrl(input: {
  apiBaseUrl: string
  userId: string
  startHistoryId: string
  pageToken?: string
  maxResults?: number
}): string {
  const url = new URL(`${input.apiBaseUrl}/users/${encodeURIComponent(input.userId)}/history`)
  url.searchParams.set("startHistoryId", input.startHistoryId)
  url.searchParams.append("historyTypes", "messageAdded")
  if (input.pageToken) url.searchParams.set("pageToken", input.pageToken)
  if (input.maxResults) url.searchParams.set("maxResults", String(input.maxResults))
  return url.toString()
}

function gmailMessageUrl(input: {
  apiBaseUrl: string
  userId: string
  messageId: string
  metadataHeaders: string[]
}): string {
  const url = new URL(
    `${input.apiBaseUrl}/users/${encodeURIComponent(input.userId)}/messages/${
      encodeURIComponent(input.messageId)
    }`,
  )
  url.searchParams.set("format", "METADATA")
  for (const header of input.metadataHeaders) {
    url.searchParams.append("metadataHeaders", header)
  }
  return url.toString()
}

function collectMessageRefs(response: GmailHistoryListResponse): GmailMessageRef[] {
  return (response.history ?? []).flatMap((item) => [
    ...(item.messages ?? []),
    ...(item.messagesAdded ?? []).map((added) => added.message).filter(isMessageRef),
  ])
}

function gmailHeaders(message: GmailApiMessage): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const header of message.payload?.headers ?? []) {
    if (!header.name || !header.value) continue
    headers[header.name.toLowerCase()] = header.value
  }
  return headers
}

function parseAddressList(value: string | undefined): GmailAddress[] | undefined {
  const addresses = (value ?? "").split(",")
    .map(parseAddress)
    .filter((address): address is GmailAddress => Boolean(address?.email))
  return addresses.length > 0 ? addresses : undefined
}

function parseAddress(value: string | undefined): GmailAddress | undefined {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return undefined

  const match = trimmed.match(/^(.*)<([^>]+)>$/)
  if (match) {
    return {
      name: match[1].trim().replace(/^"|"$/g, "") || undefined,
      email: match[2].trim().toLowerCase(),
    }
  }

  return { email: trimmed.toLowerCase() }
}

function requireMessageId(message: GmailMessageRef): string {
  if (!message.id) {
    throw new BareGmailApiTransportError(
      "gmail.invalid_response",
      "Gmail history message did not include id.",
    )
  }
  return message.id
}

function isMessageRef(value: GmailMessageRef | undefined): value is GmailMessageRef {
  return Boolean(value?.id)
}
