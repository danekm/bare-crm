# Project Wizard

Bare CRM has a small npm-style project wizard for new Deno starters:

```sh
npx -y @bare-crm/wizard@latest init my-crm
```

The wizard is intentionally small. It creates a starter project with:

- `deno.json`
- `main.ts`
- `.gitignore`
- `README.md`

SQLite is the default storage adapter:

```sh
npx -y @bare-crm/wizard@latest init my-crm --storage sqlite
```

For quick experiments, use in-memory storage:

```sh
npx -y @bare-crm/wizard@latest init my-crm --storage memory
```

The generated project runs with:

```sh
cd my-crm
deno task dev
```

The wizard does not set up a hosted app, authentication, admin screens, or plugins. Those remain
host-owned layers above the kernel.

## Local Development

Before the wizard is published to npm, run it from this repository:

```sh
node packages/wizard/bin/bare-crm-wizard.js init /tmp/my-crm --dry-run
node packages/wizard/bin/bare-crm-wizard.js init /tmp/my-crm
```

Run the wizard tests with:

```sh
node --test packages/wizard/test/*.test.js
```
