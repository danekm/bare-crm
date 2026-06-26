import type {
  BaseRecord,
  CreateParams,
  CreateResponse,
  DataProvider,
  DeleteOneParams,
  DeleteOneResponse,
  GetListParams,
  GetListResponse,
  GetOneParams,
  GetOneResponse,
  UpdateParams,
  UpdateResponse,
} from "@refinedev/core"

import { mockByResource } from "./mock"
import type { CrmRecord, CrmResource } from "../types/crm"

const apiUrl = import.meta.env.VITE_CRM_API_BASE_URL ?? ""

const resourceTypes: Partial<Record<CrmResource, CrmRecord["type"]>> = {
  contacts: "person",
  companies: "company",
  deals: "deal",
  tasks: "task",
  activities: "activity",
}

export const dataProvider: DataProvider = {
  getApiUrl: () => apiUrl,

  async getList<TData extends BaseRecord = BaseRecord>(
    params: GetListParams,
  ): Promise<GetListResponse<TData>> {
    const resource = params.resource as CrmResource
    const local = readMock(resource) as TData[]

    if (!resourceTypes[resource]) {
      return { data: local, total: local.length }
    }

    try {
      const type = resourceTypes[resource]
      const search = new URLSearchParams()
      if (type) search.set("type", type)

      const response = await fetch(`${apiUrl}/api/workbench/records?${search.toString()}`)
      if (!response.ok) throw new Error(`List request failed: ${response.status}`)

      const body = await response.json()
      const data = Array.isArray(body.items) ? body.items.map(fromDashboardRecord) : local

      return { data: data as TData[], total: data.length }
    } catch {
      return { data: local, total: local.length }
    }
  },

  async getOne<TData extends BaseRecord = BaseRecord>(
    params: GetOneParams,
  ): Promise<GetOneResponse<TData>> {
    const resource = params.resource as CrmResource
    const local = readMock(resource).find((item) => item.id === String(params.id))

    if (!resourceTypes[resource]) {
      return { data: (local ?? readMock(resource)[0]) as TData }
    }

    try {
      const type = resourceTypes[resource]
      const response = await fetch(`${apiUrl}/api/workbench/records/${type}/${params.id}`)
      if (!response.ok) throw new Error(`Show request failed: ${response.status}`)

      const body = await response.json()
      const data = body.detail ? fromDashboardRecord(body.detail) : local
      return { data: data as unknown as TData }
    } catch {
      return { data: (local ?? readMock(resource)[0]) as unknown as TData }
    }
  },

  async create<TData extends BaseRecord = BaseRecord, TVariables = object>(
    params: CreateParams<TVariables>,
  ): Promise<CreateResponse<TData>> {
    const resource = params.resource as CrmResource
    const type = resourceTypes[resource]

    if (type) {
      try {
        const response = await fetch(`${apiUrl}/api/workbench/records`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, data: params.variables }),
        })
        if (!response.ok) throw new Error(`Create request failed: ${response.status}`)
        const body = await response.json()
        return { data: fromDashboardRecord(body.item) as unknown as TData }
      } catch {
        // The scaffold works offline so designers can iterate before the API is running.
      }
    }

    return {
      data: {
        id: crypto.randomUUID(),
        ...(params.variables as object),
      } as unknown as TData,
    }
  },

  async update<TData extends BaseRecord = BaseRecord, TVariables = object>(
    params: UpdateParams<TVariables>,
  ): Promise<UpdateResponse<TData>> {
    const resource = params.resource as CrmResource
    const current = readMock(resource).find((item) => item.id === String(params.id))
    return {
      data: {
        ...current,
        ...(params.variables as object),
        id: String(params.id),
      } as unknown as TData,
    }
  },

  async deleteOne<TData extends BaseRecord = BaseRecord, TVariables = object>(
    params: DeleteOneParams<TVariables>,
  ): Promise<DeleteOneResponse<TData>> {
    const resource = params.resource as CrmResource
    const type = resourceTypes[resource]

    if (type) {
      try {
        await fetch(`${apiUrl}/api/workbench/records/${type}/${params.id}/archive`, {
          method: "POST",
        })
      } catch {
        // Keep archive non-blocking in mock/dev mode.
      }
    }

    return {
      data: {
        id: String(params.id),
        archived: true,
      } as unknown as TData,
    }
  },
}

function readMock(resource: CrmResource): BaseRecord[] {
  return [...(mockByResource[resource] ?? [])] as BaseRecord[]
}

function fromDashboardRecord(record: Record<string, unknown>): CrmRecord {
  const ref = record.ref as { id?: string; type?: CrmRecord["type"] } | undefined
  const fields = Array.isArray(record.fields) ? record.fields : []
  const fieldValue = (label: string) => {
    const field = fields.find((item) =>
      typeof item === "object" && item && "label" in item && item.label === label
    ) as { value?: string } | undefined
    return field?.value
  }

  return {
    id: String(ref?.id ?? record.id ?? ""),
    type: ref?.type ?? "collection",
    title: String(record.title ?? "Untitled"),
    subtitle: record.subtitle ? String(record.subtitle) : undefined,
    eyebrow: record.eyebrow ? String(record.eyebrow) : undefined,
    badges: Array.isArray(record.badges) ? record.badges.map(String) : [],
    updatedAt: record.updatedAt ? String(record.updatedAt) : undefined,
    archived: Boolean(record.archived),
    owner: fieldValue("Owner"),
    stage: fieldValue("Status") ?? fieldValue("Stage"),
    value: fieldValue("Value"),
    nextStep: fieldValue("Next step"),
    email: fieldValue("Email"),
    phone: fieldValue("Phone"),
    company: fieldValue("Company"),
  }
}
