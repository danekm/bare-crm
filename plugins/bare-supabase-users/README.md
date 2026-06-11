# Bare Supabase Users Plugin

This plugin looks up app users stored in Supabase and optionally links them to Bare CRM `Person`
records.

It is not a Bare CRM storage adapter. The CRM kernel still stores CRM records through its own
Storage API. This plugin reads your app's Supabase user/profile tables as an external system.

```txt
Support/Gmail plugin
  -> Supabase Users plugin
    -> Supabase REST API
  -> Extension Host
    -> Read API / Write API
      -> Kernel
```

## Current Slice

- validates and installs as a workspace-scoped plugin
- finds an app user by email through an injectable directory or Supabase REST API
- links matched app users to CRM people with `externalRefs`
- creates a CRM `Person` if no matching person exists
- updates an existing CRM `Person` when the email already exists but the app-user ref is missing
- keeps full app user data outside the kernel

## Secrets

When using the built-in Supabase REST directory, store these plugin secrets per workspace:

- `supabase_url`
- `supabase_service_role_key`

The table and column mapping can be passed to the runner:

```ts
createSupabaseUsersPluginRunner({
  host,
  workspaceId,
  config: {
    table: "profiles",
    idColumn: "id",
    emailColumn: "email",
    nameColumn: "full_name",
    system: "app:my-product",
    adminUrlTemplate: "https://app.example.com/admin/users/{id}",
    traitColumns: {
      plan: "plan",
      status: "status",
    },
  },
})
```

## CRM Mapping

Matched users are linked to people like this:

```json
{
  "externalRefs": [
    {
      "system": "app:my-product",
      "id": "user_123",
      "kind": "canonical",
      "url": "https://app.example.com/admin/users/user_123"
    }
  ],
  "custom": {
    "appUsers": {
      "app:my-product": {
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
