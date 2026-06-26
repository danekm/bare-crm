import type { GranolaNote } from "./api.ts"

export type BareGranolaSyncCursorRef = {
  workspaceId: string
  pluginId: string
  syncId: string
}

export type BareGranolaSyncState = {
  updatedAfter: string | null
  lastCursor?: string | null
}

export type BareGranolaPluginStateStore = {
  getSyncState(ref: BareGranolaSyncCursorRef): Promise<BareGranolaSyncState>
  setSyncState(ref: BareGranolaSyncCursorRef & BareGranolaSyncState): Promise<void>
  saveRawNote?(ref: BareGranolaSyncCursorRef & { note: GranolaNote }): Promise<void>
}

export function createMemoryBareGranolaPluginStateStore(): BareGranolaPluginStateStore & {
  getRawNote(ref: BareGranolaSyncCursorRef & { noteId: string }): Promise<GranolaNote | null>
} {
  const cursors = new Map<string, BareGranolaSyncState>()
  const rawNotes = new Map<string, GranolaNote>()

  return {
    async getSyncState(ref) {
      return cursors.get(syncCursorKey(ref)) ?? { updatedAfter: null, lastCursor: null }
    },
    async setSyncState(ref) {
      cursors.set(syncCursorKey(ref), {
        updatedAfter: ref.updatedAfter,
        lastCursor: ref.lastCursor ?? null,
      })
    },
    async saveRawNote(ref) {
      rawNotes.set(rawNoteKey({ ...ref, noteId: ref.note.id }), ref.note)
    },
    async getRawNote(ref) {
      return rawNotes.get(rawNoteKey(ref)) ?? null
    },
  }
}

function syncCursorKey(ref: BareGranolaSyncCursorRef): string {
  return `${ref.workspaceId}:${ref.pluginId}:${ref.syncId}`
}

function rawNoteKey(ref: BareGranolaSyncCursorRef & { noteId: string }): string {
  return `${syncCursorKey(ref)}:${ref.noteId}`
}
