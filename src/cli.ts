import { runCli } from "./adapters/cli/mod.ts"

export { runCli }
export type { CliDependencies, CliIo, CliRunOptions } from "./adapters/cli/mod.ts"

if (import.meta.main) {
  Deno.exit(await runCli(Deno.args))
}
