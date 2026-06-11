export { createCrmKernel, CrmKernelError, CrmNotFoundError, CrmPermissionError } from "./kernel.ts"
export type { CrmKernelOptions } from "./kernel.ts"
export { createCrmAdmin } from "./admin.ts"
export type {
  AdminDoctorCheck,
  AdminDoctorReport,
  AdminEventMetadata,
  AdminPluginValidationResult,
  AdminStatus,
  CrmAdmin,
  CrmAdminOptions,
} from "./admin.ts"
export { createExtensionHost, createMemorySecretStore, ExtensionHostError } from "./extensions.ts"
export type {
  CollectionProfileValidationIssue,
  CollectionProfileValidationResult,
  ExtensionEventCursor,
  ExtensionHost,
  ExtensionHostOptions,
  ExtensionInstallInput,
  ExtensionPluginState,
  SecretRef,
  SecretStore,
} from "./extensions.ts"
export {
  exportJsonLines,
  exportRecords,
  findByExternalRef,
  importByExternalRef,
  ImportExportError,
  mergeExternalRefs,
} from "./import_export.ts"
export type {
  BareCrmExportLine,
  CreateWriteName,
  ExportRecordsInput,
  FindByExternalRefInput,
  ImportByExternalRefMode,
  ImportByExternalRefRequest,
  ImportByExternalRefResult,
  ImportExportOptions,
} from "./import_export.ts"
export {
  classifyGmailMessage,
  createGmailActivityInput,
  createGmailContextRequest,
  createGmailExternalRefs,
  createGmailFollowUpTaskInput,
  createGmailThreadCollectionInput,
  gmailMessageDedupeKey,
} from "./gmail_plugin.ts"
export type {
  GmailActivityDraftInput,
  GmailAddress,
  GmailClassification,
  GmailClassificationBucket,
  GmailClassifierSettings,
  GmailCollectionDraftInput,
  GmailContextRequest,
  GmailMessageSnapshot,
  GmailTaskDraftInput,
} from "./gmail_plugin.ts"
export {
  createPluginExecutionContext,
  kernelCapabilitiesFromPlugin,
  PluginManifestError,
  validatePluginManifest,
} from "./plugins.ts"
export {
  callMcpTool,
  createMcpExecutionContext,
  createMcpSchema,
  MCP_RESOURCE_TEMPLATES,
  MCP_TOOL_DEFINITIONS,
  readMcpResource,
} from "./mcp.ts"
export type {
  BareCrmMcpSchema,
  McpCallOptions,
  McpCallResult,
  McpErrorShape,
  McpPolicyIssue,
  McpReadToolName,
  McpResourceReadResult,
  McpResourceTemplate,
  McpToolDefinition,
  McpToolInputByName,
  McpToolKind,
  McpToolName,
  McpToolResultByName,
  McpWriteToolName,
} from "./mcp.ts"
export type {
  PluginCollectionProfileContribution,
  PluginCommandContribution,
  PluginContributions,
  PluginFieldContribution,
  PluginManifest,
  PluginPolicyContribution,
  PluginRuntimeCapability,
  PluginSyncContribution,
  PluginUiSlotContribution,
  PluginWorkflowContribution,
} from "./plugins.ts"
export { createMemoryStorage, StorageConflictError } from "./storage.ts"
export type { StorageApi, StorageTx } from "./storage.ts"
export type * from "./types.ts"
