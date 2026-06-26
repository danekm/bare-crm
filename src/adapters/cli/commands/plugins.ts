import { pluginsHelpText } from "../help.ts"
import { redactSensitiveText, safeErrorMessage } from "../redaction.ts"
import type { CliContext } from "../types.ts"

export async function runPlugins(args: string[], context: CliContext): Promise<number> {
  const [command, path] = args

  if (command !== "validate" || !path) {
    context.io.err(pluginsHelpText())
    return 2
  }

  try {
    let text: string
    try {
      text = await context.io.readTextFile(path)
    } catch (error) {
      context.io.err(
        `Could not read plugin manifest: ${redactSensitiveText(path)}\n${safeErrorMessage(error)}`,
      )
      return 1
    }

    const result = context.admin.validatePluginManifest(JSON.parse(text))
    if (!result.ok) {
      context.io.err(`${result.error.code}: ${result.error.message}`)
      return 1
    }

    context.io.out(
      [
        "Plugin manifest ok",
        `id: ${result.summary.id}`,
        `name: ${result.summary.name}`,
        `version: ${result.summary.version}`,
        `capabilities: ${result.summary.capabilities}`,
      ].join("\n"),
    )
    return 0
  } catch (error) {
    if (error instanceof SyntaxError) {
      context.io.err(`Invalid JSON: ${error.message}`)
      return 1
    }
    throw error
  }
}
