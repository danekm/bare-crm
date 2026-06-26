# Refine Admin Workbench Lab

Experimental React workbench for Bare CRM, scaffolded with Refine as the resource/application layer
and local shadcn-style UI primitives for the visible CRM shell.

This is a lab example, not part of the stable kernel package and not the canonical workflow,
dashboard, or manifest model.

## Run

```sh
npm install
npm run dev -- --port 5173
```

The dev server runs at `http://127.0.0.1:5173/`.

During development, Vite proxies `/api/*` to the lab Bare CRM dashboard server at
`http://127.0.0.1:8787`. Start that API separately when you want live kernel-backed records:

```sh
deno task dashboard
```

If the dashboard API is not running, the frontend falls back to local mock records so product and UI
work can continue offline.

## Plugin Workbench Demo

The root route opens the chat-first workbench demo. It does not require Gmail credentials or a live
provider. The trusted local registry in `src/plugins/pluginUi.tsx` renders the `bare.followups`
navigation item, route, and response card from declarative plugin UI contributions.

The deterministic demo data in `src/data/followupDemo.ts` includes:

- four fully linked stalled-deal follow-up drafts
- one stalled account with no linked person, shown as `Unknown contact`
- a recent signal fixture to keep the stale/recent distinction explicit for future QA

Manual visual QA:

1. Start the dev server with `npm run dev -- --port 5173`.
2. Open `/` and verify the shell, transcript, response card, and composer are visible.
3. Click one dismiss icon and verify the row disappears and the ready count decrements.
4. Open `/follow-ups` and verify the trusted plugin route renders.
5. Check desktop and narrow mobile widths for horizontal overflow or clipped action text.

## Shape

- `src/App.tsx` wires Refine resources and React Router routes.
- `src/data/dataProvider.ts` adapts Refine resource calls to `/api/workbench/*` where possible.
- `src/pages/` contains the first CRM surfaces: dashboard, contacts, contact detail, deals, and
  inbox, plus experimental workflow marketplace mockups.
- `src/components/ui/` contains lightweight shadcn-style primitives that can later be replaced by
  generated shadcn/ui components if this app adopts Tailwind.
