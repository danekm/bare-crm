export type BareGoogleTasksSyncRef = {
  workspaceId: string
  pluginId: string
  taskListId: string
}

export type BareGoogleTasksSyncState = {
  updatedMin: string | null
  pageToken?: string | null
}

export type BareGoogleTasksLink = BareGoogleTasksSyncRef & {
  crmTaskId: string
  googleTaskId: string
  googleUpdated?: string
  crmVersion?: number
  syncedAt: string
}

export type BareGoogleTasksStateStore = {
  getSyncState(ref: BareGoogleTasksSyncRef): Promise<BareGoogleTasksSyncState>
  setSyncState(ref: BareGoogleTasksSyncRef & BareGoogleTasksSyncState): Promise<void>
  getLinkByCrmTaskId(
    ref: BareGoogleTasksSyncRef & { crmTaskId: string },
  ): Promise<BareGoogleTasksLink | null>
  getLinkByGoogleTaskId(
    ref: BareGoogleTasksSyncRef & { googleTaskId: string },
  ): Promise<BareGoogleTasksLink | null>
  setLink(link: BareGoogleTasksLink): Promise<void>
  deleteLink(
    ref: BareGoogleTasksSyncRef & { crmTaskId: string; googleTaskId: string },
  ): Promise<void>
}

export function createMemoryBareGoogleTasksStateStore(): BareGoogleTasksStateStore {
  const syncStates = new Map<string, BareGoogleTasksSyncState>()
  const linksByCrm = new Map<string, BareGoogleTasksLink>()
  const linksByGoogle = new Map<string, BareGoogleTasksLink>()

  return {
    async getSyncState(ref) {
      return syncStates.get(syncKey(ref)) ?? { updatedMin: null, pageToken: null }
    },
    async setSyncState(ref) {
      syncStates.set(syncKey(ref), {
        updatedMin: ref.updatedMin,
        pageToken: ref.pageToken ?? null,
      })
    },
    async getLinkByCrmTaskId(ref) {
      return linksByCrm.get(crmLinkKey(ref)) ?? null
    },
    async getLinkByGoogleTaskId(ref) {
      return linksByGoogle.get(googleLinkKey(ref)) ?? null
    },
    async setLink(link) {
      linksByCrm.set(crmLinkKey(link), link)
      linksByGoogle.set(googleLinkKey(link), link)
    },
    async deleteLink(ref) {
      linksByCrm.delete(crmLinkKey(ref))
      linksByGoogle.delete(googleLinkKey(ref))
    },
  }
}

function syncKey(ref: BareGoogleTasksSyncRef): string {
  return `${ref.workspaceId}:${ref.pluginId}:${ref.taskListId}`
}

function crmLinkKey(ref: BareGoogleTasksSyncRef & { crmTaskId: string }): string {
  return `${syncKey(ref)}:crm:${ref.crmTaskId}`
}

function googleLinkKey(ref: BareGoogleTasksSyncRef & { googleTaskId: string }): string {
  return `${syncKey(ref)}:google:${ref.googleTaskId}`
}
