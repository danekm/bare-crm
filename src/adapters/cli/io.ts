import type { CliIo } from "./types.ts"

export const defaultIo: CliIo = {
  out: (text) => console.log(text),
  err: (text) => console.error(text),
  readTextFile: (path) => Deno.readTextFile(path),
}
