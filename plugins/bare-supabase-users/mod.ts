export {
  BARE_SUPABASE_USERS_PLUGIN_ID,
  BARE_SUPABASE_USERS_REQUIRED_CAPABILITIES,
  BareSupabaseUsersPluginError,
  bareSupabaseUsersPluginManifest,
  createSupabaseAppUserDirectory,
  createSupabaseUsersPluginRunner,
  installBareSupabaseUsersPlugin,
  linkAppUserPersonByEmail,
} from "./runner.ts"
export type {
  AppUserDirectory,
  AppUserMatch,
  AppUserTraits,
  BareSupabaseUsersInstallInput,
  BareSupabaseUsersLinkPersonInput,
  BareSupabaseUsersLinkPersonResult,
  BareSupabaseUsersRunner,
  BareSupabaseUsersRunnerOptions,
  SupabaseAppUserDirectoryOptions,
  SupabaseAppUserTableConfig,
} from "./runner.ts"
