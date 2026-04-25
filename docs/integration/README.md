# EMR External Integration API

This document is for **third-party developers** connecting labs, pharmacies, billing systems, schedulers, telehealth platforms, insurance verification tools, patient apps, and internal automation to the EMR over HTTPS.

## Base URL and versioning

- **Base path:** `https://<your-host>/api/v1`
- **Current version:** `1` (URL prefix). Breaking changes will be introduced under `/api/v2` with advance notice.

### Versioning and deprecation policy

- **Stable URLs:** Resource paths under `/api/v1` remain stable within a major version.
- **Additive changes:** New fields in JSON bodies or responses, optional query parameters, and new event types are non-breaking.
- **Breaking changes:** Removing fields, changing types, or changing semantics require a new major version (`/api/v2`).
- **Sunset:** When a major version is deprecated, the `Deprecation` and `Sunset` headers may be returned on responses, and documentation will list a minimum migration window (typically **6–12 months** for healthcare integrations).

---

## Authentication

Two supported mechanisms:

### 1) API key (recommended for server-to-server)

Systems administrators create keys via the staff UI API:

- `POST /api/admin/integration/api-keys` (JWT session: `super_admin` or `security`)

The plaintext key is shown **once**, in the form:

```text
ehr_live_<uuid>_<secret>
```

Send it on every request:

```http
Authorization: Bearer ehr_live_<uuid>_<secret>
```

Keys can be **facility-scoped** (optional `facilityId`). When set, reads/writes for patients and appointments are limited to that facility.

### 2) OAuth2 client credentials (access token)

Obtain a short-lived JWT:

```http
POST /api/v1/oauth/token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "<api key uuid>",
  "client_secret": "<secret portion only, OR full ehr_live_… key>"
}
```

Response:

```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Use:

```http
Authorization: Bearer <jwt>
```

Configure signing:

- `INTEGRATION_JWT_SECRET` (recommended in production), or falls back to `SESSION_SECRET`.

---

## Scopes (RBAC)

Each key has an array of scopes. Wildcard:

- `integration:*` — full access (use only for tightly controlled internal bridges).

Fine-grained examples:

| Scope | Purpose |
|--------|---------|
| `patients:read` / `patients:write` | Demographics and patient lifecycle |
| `providers:read` | Clinicians / staff directory |
| `appointments:read` / `appointments:write` | Scheduling |
| `encounters:read` / `encounters:write` | Visits |
| `medications:read` / `medications:write` | Prescriptions |
| `allergies:read` / `allergies:write` | Structured allergies |
| `problems:read` / `problems:write` | Problem list |
| `labs:read` / `labs:write` | Lab orders and results |
| `vitals:read` / `vitals:write` | Vitals |
| `notes:read` / `notes:write` | Clinical notes |
| `documents:read` / `documents:write` | Patient documents metadata |
| `billing:read` / `billing:write` | Invoices / claims-shaped data |
| `insurance:write` | Patient insurance fields (via `PATCH /patients/:id/insurance`) |
| `facilities:read` / `facilities:write` | Facilities |
| `users:read` | Directory (no passwords) |
| `audit:read` | Audit log export |
| `webhooks:read` / `webhooks:write` | Subscription management |

---

## Request conventions

- **Content-Type:** `application/json` for bodies.
- **Pagination:** `limit` (default 50, max 200), `offset` (default 0) where listed.
- **Search:** `q` on some list endpoints (e.g. patients).
- **Sorting:** reserved for future use (`sort` query parameter may be ignored until standardized).
- **Idempotency:** For `POST`, `PUT`, `PATCH`, send `Idempotency-Key: <unique string>` (max 256 chars). The server stores the **first successful** response for that key and replays it for identical requests. A different body with the same key returns **409** (`IDEMPOTENCY_KEY_REUSE`).
- **Rate limiting:** Per API key (default **120 requests/minute**). Response **429** when exceeded. Configure with `INTEGRATION_RATE_LIMIT_PER_MIN`.
- **Persisted rate limiting:** If `REDIS_URL` is set, rate limiting is enforced via Redis (recommended for production / multi-instance deployments). If Redis is unavailable, the limiter **fails open** to avoid breaking clinical workflows; monitor Redis health.
- **FHIR-friendly JSON:** Several resources include `resourceType` and field names aligned with FHIR where practical; this is **not** a full FHIR server.

---

## Error model

JSON error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "details": {}
  }
}
```

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_ERROR`, `INVALID_QUERY`, … | Bad input |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` | Missing/invalid auth |
| 403 | `FORBIDDEN` | Missing scope or facility mismatch |
| 404 | `NOT_FOUND` | Resource not found or not visible |
| 409 | `IDEMPOTENCY_KEY_REUSE` | Idempotency conflict |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | (message) | Server error |

Legacy staff UI routes often return `{ "message": "..." }`; integration routes use the `error` object above.

---

## Endpoint map (summary)

| Resource | Endpoints |
|----------|-----------|
| Meta | `GET /meta` |
| Patients | `GET/POST /patients`, `GET/PATCH/DELETE /patients/:id`, `GET /patients/by-external-id`, `PATCH /patients/:id/insurance`, `GET/POST /patients/:id/external-ids` |
| Providers | `GET /providers`, `GET /providers/:id` |
| Appointments | `GET/POST /appointments`, `GET/PATCH /appointments/:id` |
| Encounters | `GET/POST /encounters`, `GET/PATCH /encounters/:id` |
| Medications | `GET/POST /medications`, `GET/PATCH /medications/:id` |
| Allergies | `GET/POST /allergies`, `DELETE /allergies/:id` |
| Problems | `GET/POST /problems`, `PATCH /problems/:id` |
| Lab orders | `GET/POST /lab-orders`, `GET/PATCH /lab-orders/:id` |
| Vitals | `GET/POST /vitals`, `PATCH /vitals/:id` |
| Clinical notes | `GET/POST /clinical-notes`, `PATCH /clinical-notes/:id` |
| Documents | `GET/POST /documents` |
| Billing | `GET/POST /billing/invoices`, `GET/PATCH /billing/invoices/:id` |
| Facilities | `GET/POST /facilities`, `GET/PATCH /facilities/:id` |
| Users / roles | `GET /users`, `GET /users/:id`, `GET /roles` |
| Audit | `GET /audit-logs` |
| Webhooks | `GET/POST /webhooks`, `DELETE /webhooks/:id` |

OpenAPI: [`openapi.yaml`](./openapi.yaml).

---

## Webhooks

Register subscriptions with the **same API key** used for REST calls:

```http
POST /api/v1/webhooks
Authorization: Bearer …
Content-Type: application/json

{
  "url": "https://partner.example.com/hooks/ehr",
  "eventTypes": ["appointment.created", "patient.created"],
  "secret": "optional-min-16-chars-or-server-generated"
}
```

Response includes a **`secret`** for HMAC verification (if you did not supply one).

### Delivery

- **HTTP:** `POST` to your URL.
- **Headers:**
  - `Content-Type: application/json`
  - `X-Integration-Timestamp` — Unix seconds (string)
  - `X-Integration-Signature` — `sha256=<hex>` where `hex = HMAC_SHA256(secret, timestamp + "." + rawBody)` (string concatenation, same order as headers)
  - `X-Integration-Webhook-Id` — subscription id

### Retry behavior

- Webhooks are delivered via an internal **durable queue** in Postgres (`integration_webhook_deliveries`).
- Non-2xx responses and network errors are retried with **exponential backoff + jitter** until delivered.
- Production recommendation: run Postgres on durable storage and monitor the size/age of pending deliveries.

### Example payload

```json
{
  "id": "evt_<uuid>",
  "type": "appointment.created",
  "createdAt": "2026-04-20T12:00:00.000Z",
  "source": "app",
  "data": {
    "appointment": { }
  }
}
```

**Facility-scoped keys** only receive events whose `facilityId` matches (or global events without facility scoping). Implementations may extend event fan-out in future releases.

---

## Common workflows (cURL)

Replace `BASE` and `KEY`.

### Create a patient

```bash
curl -sS -X POST "$BASE/api/v1/patients" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Ada","lastName":"Lovelace","dateOfBirth":"1815-12-10","gender":"female","mrn":"TEST-001"}'
```

### Schedule an appointment

```bash
curl -sS -X POST "$BASE/api/v1/appointments" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"patientId":"<pid>","clinicianId":"<cid>","scheduledDate":"2026-04-21T14:00:00.000Z","duration":30,"status":"scheduled"}'
```

### Record an encounter

```bash
curl -sS -X POST "$BASE/api/v1/encounters" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"patientId":"<pid>","clinicianId":"<cid>","type":"outpatient","status":"in_progress"}'
```

### Add vitals

```bash
curl -sS -X POST "$BASE/api/v1/vitals" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"encounterId":"<eid>","patientId":"<pid>","heartRate":72,"bloodPressureSystolic":120,"bloodPressureDiastolic":78}'
```

### Upload / attach lab result (lab order update)

```bash
curl -sS -X PATCH "$BASE/api/v1/lab-orders/<lid>" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"resulted","result":"Negative","resultValue":"0","referenceRange":"<5","completedAt":"2026-04-20T15:00:00.000Z"}'
```

### Write a clinical note

```bash
curl -sS -X POST "$BASE/api/v1/clinical-notes" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"patientId":"<pid>","encounterId":"<eid>","content":"Assessment and plan…","authorRole":"clinician"}'
```

### Send medication (prescription)

```bash
curl -sS -X POST "$BASE/api/v1/medications" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"patientId":"<pid>","encounterId":"<eid>","medicationName":"Example","dosage":"500mg","frequency":"BID"}'
```

### Pull patient history (aggregated reads)

Use `GET /api/v1/patients/:id`, then `GET /encounters?patient_id=`, `GET /medications?patient_id=`, `GET /lab-orders?patient_id=`, `GET /clinical-notes?patient_id=`, etc.

### Register a webhook

```bash
curl -sS -X POST "$BASE/api/v1/webhooks" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/hook","eventTypes":["appointment.created"]}'
```

### Receive `appointment.created`

Subscribe to `appointment.created`. Events are emitted when appointments are created **via the integration API** or **the main EMR UI** (staff-created appointments).

### Sync external patient ID

```bash
curl -sS -X POST "$BASE/api/v1/patients/<pid>/external-ids" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"resourceType":"Patient","externalSystem":"epic","externalId":"E123"}'
```

Resolve by external id:

```bash
curl -sS "$BASE/api/v1/patients/by-external-id?system=epic&external_id=E123" \
  -H "Authorization: Bearer $KEY"
```

---

## Integration best practices

- **Least privilege:** Issue keys with the minimum scopes and optional facility scope.
- **Secrets:** Store API keys in a secret manager; never log `Authorization` headers.
- **Retries:** Use exponential backoff on **429** and **5xx**; respect `Idempotency-Key` for creates.
- **Clocks:** Use UTC (`Z`) in ISO-8601 timestamps.
- **Webhooks:** Verify `X-Integration-Signature` before processing; reject stale timestamps (for example more than 5 minutes skew).
- **Correlation:** Prefer your own idempotency keys and external-id mappings for cross-system reconciliation.

---

## Security and compliance notes (HIPAA-aware)

- **Transport:** HTTPS/TLS only in production; terminate TLS at a compliant load balancer or reverse proxy.
- **PHI:** Patient data returned by this API is **PHI**; sign a **BAA** with customers where required and restrict keys to named integrations.
- **Audit:** Staff actions and integration actions write to `audit_logs` where applicable; export via `GET /audit-logs` with `audit:read`.
- **Session vs integration:** Staff JWTs and integration keys are separate mechanisms; do not reuse staff passwords as API secrets.
- **Key rotation:** Deactivate keys with `PATCH /api/admin/integration/api-keys/:id` (`isActive: false`) and issue new keys.

---

## Admin API (staff JWT, not integration key)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/integration/api-keys` | Create key (returns plaintext once) |
| GET | `/api/admin/integration/api-keys` | List keys (metadata only) |
| PATCH | `/api/admin/integration/api-keys/:id` | `{ "isActive": false }` to revoke |

Requires `super_admin` or `security` role.

---

## Further reading

- [OpenAPI specification](./openapi.yaml)
- [Postman collection](./ehr-integration.postman_collection.json)
