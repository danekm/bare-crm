#!/usr/bin/env node
import { runCli } from "../src/index.js"

runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr,
}).catch((error) => {
  process.stderr.write(`Bare CRM wizard failed: ${error.message}\n`)
  process.exitCode = 1
})
