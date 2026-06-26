import { formatDoctorText } from "../format.ts"
import { optionValue } from "../options.ts"
import type { CliContext } from "../types.ts"

export function runDoctor(args: string[], context: CliContext): number {
  const format = optionValue(args, "--format") ?? "text"
  if (format !== "text" && format !== "json") {
    context.io.err("Invalid --format value. Expected text or json.")
    return 2
  }

  const result = context.admin.doctor()

  if (format === "json") {
    context.io.out(JSON.stringify(result, null, 2))
    return result.status === "fail" ? 1 : 0
  }

  context.io.out(formatDoctorText(result))
  return result.status === "fail" ? 1 : 0
}
