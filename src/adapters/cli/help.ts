export function helpText(): string {
  return [
    "Usage: crm <command>",
    "",
    "Commands:",
    "  doctor                         Run privacy-preserving readiness checks",
    "  doctor --format json           Print doctor output as JSON",
    "  db schema postgres             Print official Postgres schema SQL",
    "  db status sqlite <path>        Show SQLite schema migration status",
    "  db migrate sqlite <path>       Apply pending SQLite schema migrations",
    "  db migrate sqlite <path> --dry-run",
    "  plugins validate <path>        Validate a plugin manifest",
    "  version                        Print CLI version",
    "  help                           Show this help",
  ].join("\n")
}

export function dbHelpText(): string {
  return [
    "Usage: crm db <command>",
    "",
    "Commands:",
    "  db schema postgres             Print official Postgres schema SQL",
    "  db status sqlite <path>        Show SQLite schema migration status",
    "  db migrate sqlite <path>       Apply pending SQLite schema migrations",
    "  db migrate sqlite <path> --dry-run",
  ].join("\n")
}

export function pluginsHelpText(): string {
  return [
    "Usage: crm plugins <command>",
    "",
    "Commands:",
    "  plugins validate <path>        Validate a plugin manifest",
  ].join("\n")
}
