import type { GmailClassifierSettings } from "../../index.ts"
import type {
  BareGmailIgnoreDomainInput,
  BareGmailIgnoreSenderInput,
  BareGmailMarkNotRelevantInput,
  BareGmailPreferencesRef,
  BareGmailPreferenceStore,
} from "./addon.ts"
import type { BareGmailReviewItem, BareGmailReviewStatus, BareGmailReviewStore } from "./review.ts"
import type { BareGmailSyncCursorRef, BareGmailSyncStateStore } from "./sync.ts"

export type BareGmailOAuthSecretRefs = {
  clientId?: string
  clientSecret?: string
  refreshToken?: string
  accessToken?: string
}

export type BareGmailOAuthSecretRefInput = BareGmailPreferencesRef & {
  secretRefs: BareGmailOAuthSecretRefs
}

export type BareGmailPluginStateStore =
  & BareGmailPreferenceStore
  & BareGmailReviewStore
  & BareGmailSyncStateStore
  & {
    getOAuthSecretRefs(ref: BareGmailPreferencesRef): Promise<BareGmailOAuthSecretRefs | null>
    setOAuthSecretRefs(input: BareGmailOAuthSecretRefInput): Promise<void>
  }

type PersistedWorkspaceState = {
  preferences?: GmailClassifierSettings
  oauthSecretRefs?: BareGmailOAuthSecretRefs
  reviews?: Record<string, BareGmailReviewItem>
}

type PersistedGmailPluginState = {
  cursors?: Record<string, string>
  workspaces?: Record<string, PersistedWorkspaceState>
}

type StatePersistence = {
  load(): Promise<PersistedGmailPluginState>
  save(state: PersistedGmailPluginState): Promise<void>
}

export function createMemoryBareGmailPluginStateStore(
  initial: PersistedGmailPluginState = {},
): BareGmailPluginStateStore {
  let state = cloneState(initial)
  return createBareGmailPluginStateStore({
    async load() {
      return cloneState(state)
    },
    async save(next) {
      state = cloneState(next)
    },
  })
}

export function createJsonFileBareGmailPluginStateStore(
  path: string,
): BareGmailPluginStateStore {
  return createBareGmailPluginStateStore({
    async load() {
      try {
        return JSON.parse(await Deno.readTextFile(path)) as PersistedGmailPluginState
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) return {}
        throw error
      }
    },
    async save(state) {
      await Deno.mkdir(parentDir(path), { recursive: true })
      await Deno.writeTextFile(path, `${JSON.stringify(state, null, 2)}\n`)
    },
  })
}

function createBareGmailPluginStateStore(
  persistence: StatePersistence,
): BareGmailPluginStateStore {
  return {
    async getCursor(ref) {
      const state = await persistence.load()
      return state.cursors?.[syncCursorKey(ref)] ?? null
    },
    async setCursor(ref) {
      await mutateState(persistence, (state) => {
        state.cursors ??= {}
        state.cursors[syncCursorKey(ref)] = ref.cursor
      })
    },
    async getClassifierSettings(ref) {
      return cloneSettings(workspaceState(await persistence.load(), ref.workspaceId).preferences)
    },
    async ignoreSender(input) {
      return await updatePreferences(persistence, input, (preferences) => {
        preferences.ignoredSenders = addUnique(
          preferences.ignoredSenders,
          normalizeEmail(input.email),
        )
      })
    },
    async ignoreDomain(input) {
      return await updatePreferences(persistence, input, (preferences) => {
        preferences.ignoredDomains = addUnique(
          preferences.ignoredDomains,
          normalizeDomain(input.domain),
        )
      })
    },
    async markNotCrmRelevant(input) {
      return await updatePreferences(persistence, input, (preferences) => {
        const sender = normalizeEmail(input.message.from?.email)
        if (sender) preferences.ignoredSenders = addUnique(preferences.ignoredSenders, sender)
      })
    },
    async upsert(item) {
      await mutateState(persistence, (state) => {
        const workspace = mutableWorkspaceState(state, item.workspaceId)
        workspace.reviews ??= {}
        workspace.reviews[item.id] = cloneReview(item)
      })
      return cloneReview(item)
    },
    async get(input) {
      const state = await persistence.load()
      const item = workspaceState(state, input.workspaceId).reviews?.[input.id]
      return item ? cloneReview(item) : null
    },
    async list(input) {
      const state = await persistence.load()
      return Object.values(workspaceState(state, input.workspaceId).reviews ?? {})
        .filter((item) => !input.status || item.status === input.status)
        .map(cloneReview)
    },
    async resolve(input) {
      let resolved: BareGmailReviewItem | null = null
      await mutateState(persistence, (state) => {
        const workspace = mutableWorkspaceState(state, input.workspaceId)
        const item = workspace.reviews?.[input.id]
        if (!item) return
        resolved = {
          ...item,
          status: input.status,
          updatedAt: new Date().toISOString(),
        }
        workspace.reviews ??= {}
        workspace.reviews[input.id] = resolved
      })
      return resolved ? cloneReview(resolved) : null
    },
    async getOAuthSecretRefs(ref) {
      const state = await persistence.load()
      const refs = workspaceState(state, ref.workspaceId).oauthSecretRefs
      return refs ? { ...refs } : null
    },
    async setOAuthSecretRefs(input) {
      await mutateState(persistence, (state) => {
        mutableWorkspaceState(state, input.workspaceId).oauthSecretRefs = { ...input.secretRefs }
      })
    },
  }
}

async function updatePreferences<T extends BareGmailPreferencesRef>(
  persistence: StatePersistence,
  input: T,
  update: (preferences: GmailClassifierSettings) => void,
): Promise<GmailClassifierSettings> {
  let updated: GmailClassifierSettings = {}
  await mutateState(persistence, (state) => {
    const workspace = mutableWorkspaceState(state, input.workspaceId)
    const preferences = cloneSettings(workspace.preferences)
    update(preferences)
    workspace.preferences = preferences
    updated = cloneSettings(preferences)
  })
  return updated
}

async function mutateState(
  persistence: StatePersistence,
  update: (state: PersistedGmailPluginState) => void,
): Promise<void> {
  const state = await persistence.load()
  update(state)
  await persistence.save(state)
}

function workspaceState(
  state: PersistedGmailPluginState,
  workspaceId: string,
): PersistedWorkspaceState {
  return state.workspaces?.[workspaceId] ?? {}
}

function mutableWorkspaceState(
  state: PersistedGmailPluginState,
  workspaceId: string,
): PersistedWorkspaceState {
  state.workspaces ??= {}
  state.workspaces[workspaceId] ??= {}
  return state.workspaces[workspaceId]
}

function cloneState(state: PersistedGmailPluginState): PersistedGmailPluginState {
  return JSON.parse(JSON.stringify(state)) as PersistedGmailPluginState
}

function cloneSettings(settings: GmailClassifierSettings | undefined): GmailClassifierSettings {
  return {
    internalDomains: [...(settings?.internalDomains ?? [])],
    ignoredSenders: [...(settings?.ignoredSenders ?? [])],
    ignoredDomains: [...(settings?.ignoredDomains ?? [])],
    knownCustomerDomains: [...(settings?.knownCustomerDomains ?? [])],
  }
}

function cloneReview(item: BareGmailReviewItem): BareGmailReviewItem {
  return {
    ...item,
    message: {
      ...item.message,
      to: item.message.to?.map((address) => ({ ...address })),
      cc: item.message.cc?.map((address) => ({ ...address })),
      from: item.message.from ? { ...item.message.from } : undefined,
      headers: item.message.headers ? { ...item.message.headers } : undefined,
      labelIds: item.message.labelIds ? [...item.message.labelIds] : undefined,
    },
    classification: {
      ...item.classification,
      reasons: [...item.classification.reasons],
      signals: [...item.classification.signals],
      suggestedActions: [...item.classification.suggestedActions],
    },
  }
}

function addUnique(values: string[] | undefined, value: string): string[] {
  return [...new Set([...(values ?? []), value].filter(Boolean))]
}

function syncCursorKey(ref: BareGmailSyncCursorRef): string {
  return `${ref.workspaceId}:${ref.pluginId}:${ref.syncId}`
}

function parentDir(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  return index > 0 ? path.slice(0, index) : "."
}

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase()
}
