# Import And Export

Imports use the Write API. Exports use the Read API.

Neither should bypass the Storage API directly.

## Imports

Imports should:

- accept incomplete records
- preserve `source` and `externalRefs`
- use idempotency keys
- support dry-run validation
- return per-row success/failure results

## Exports

The first durable export format should be JSON Lines. CSV can follow for common person, company, and
deal exports.

## External References

External references preserve source identity:

```ts
type ExternalRef = {
  system: string
  id: string
  url?: string
  kind?: "source" | "dedupe" | "canonical"
  lastSeenAt?: string
}
```
