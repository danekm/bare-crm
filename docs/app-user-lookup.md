# App User Lookup

App users are not kernel entities.

Each app workspace may need to connect support or business-development messages back to that app's
user records. The clean path is an app-user lookup plugin that treats the app database as an
external system.

```txt
Support or Gmail plugin
  -> App user lookup plugin
    -> app database/API, for example Supabase
  -> Extension Host
    -> Read API / Write API
      -> Kernel
```

The first concrete plugin is `plugins/bare-supabase-users/`.

## Why This Is A Plugin

The Supabase app-user lookup plugin is not the Postgres/Supabase Storage API adapter.

- Storage adapter: stores Bare CRM kernel records.
- App-user lookup plugin: reads your app's user/profile tables and links useful matches to CRM
  people.

This keeps product-specific user data, auth assumptions, billing state, and app schemas outside the
kernel.

## CRM Mapping

When a support email arrives, a channel plugin can ask the lookup plugin for the sender:

```txt
ada@example.com
  -> app user user_123 in App A
  -> CRM Person externalRef app:app-a/user_123
  -> support Collection or email Activity related to that Person
```

The durable CRM link should be small:

```json
{
  "externalRefs": [
    {
      "system": "app:app-a",
      "id": "user_123",
      "kind": "canonical",
      "url": "https://app.example.com/admin/users/user_123"
    }
  ],
  "custom": {
    "appUsers": {
      "app:app-a": {
        "userId": "user_123",
        "email": "ada@example.com",
        "traits": {
          "plan": "pro",
          "status": "active"
        }
      }
    }
  }
}
```

Store only useful, low-risk traits in CRM. Full app-user records stay in the app database.

## Workspace Scope

For one workspace per app, configure the plugin separately in each workspace:

```txt
Workspace App A
  -> Supabase URL/key/table mapping for App A
  -> externalRef system app:app-a

Workspace App B
  -> Supabase URL/key/table mapping for App B
  -> externalRef system app:app-b
```

Plugin secrets, capability grants, app-user refs, and support inboxes all remain workspace-scoped.
