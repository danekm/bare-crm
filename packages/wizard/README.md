# Bare CRM Wizard

Small `npx` wizard for starting a Bare CRM project.

```sh
npx -y @bare-crm/wizard@latest init my-crm
```

The first version is intentionally tiny. It creates a Deno starter with:

- `deno.json`
- `main.ts`
- `.gitignore`
- `README.md`

SQLite is the default storage adapter:

```sh
npx -y @bare-crm/wizard@latest init my-crm --storage sqlite
```

For a quick in-memory prototype:

```sh
npx -y @bare-crm/wizard@latest init my-crm --storage memory
```

Before publishing, test this package locally:

```sh
npm test --prefix packages/wizard
node packages/wizard/bin/bare-crm-wizard.js init /tmp/bare-crm-demo --dry-run
```
