# Shelter Surrender Triage

Decision support for animal shelter surrender-request triage, built as a Cloudflare Worker. It watches one Microsoft 365 shared mailbox, classifies matching new Inbox messages with TypeSafe AI's Jev model, applies Outlook categories, and moves successful requests to a dedicated folder. Staff remain entirely in Outlook. See [PRD.md](./PRD.md) for the product context.

## Runtime flow

1. A Microsoft Graph subscription sends created-message and lifecycle notifications to `POST /webhooks/graph`. The handler validates `clientState` and queues immutable message IDs or lifecycle work without reading or classifying a message. Lifecycle jobs immediately reauthorize expiring authorization, recreate removed subscriptions, or reconcile missed notifications.
2. A scheduled run every ten minutes idempotently creates the destination folder and missing master categories, creates or renews the Graph subscription, replaces it if webhook endpoints change, and scans a bounded recent Inbox window for matching messages missed by notifications.
3. The single-concurrency Queue consumer confirms the message is still in Inbox and exact-matches the configured sender and subject (case-insensitive after trimming). It requests a text body from Graph and sends the subject and body to Jev in one request.
4. The consumer preserves unrelated Outlook categories, replaces managed triage categories with exactly one priority and all issue categories at or above `0.5`, then moves the message. `Other / unclear` is used only when no substantive category reaches the threshold.

The Inbox/folder location is the processing state. A failed Graph or Jev request leaves the message in Inbox for Queue retry and scheduled rediscovery. A duplicate whose immutable ID is missing or no longer in Inbox is acknowledged. Message bodies are neither stored nor logged.

## Microsoft and Cloudflare prerequisites

### Production shared-mailbox authorization

Create a single-tenant Microsoft Entra application using client-credential authentication. For least-privilege access, assign these Exchange Online **Application RBAC** roles with a resource scope restricted to the shared mailbox:

- `Application Mail.ReadWrite`
- `Application MailboxSettings.ReadWrite`

Do not also grant the corresponding tenant-wide Microsoft Graph application permissions in Entra. Entra grants and Exchange Application RBAC assignments are additive, so an unscoped Entra grant would defeat the mailbox restriction. `OUTLOOK_SHARED_MAILBOX` may be the shared mailbox's object ID or SMTP address.

### Personal-mailbox development authorization

For development without tenant administration, set `MICROSOFT_AUTH_MODE=delegated` and authorize a personal Microsoft mailbox using OAuth device authorization. The app registration must support personal Microsoft accounts, enable public client flows, and request delegated `Mail.ReadWrite`, `MailboxSettings.ReadWrite`, and `offline_access` permissions. Set `MICROSOFT_TENANT_ID=consumers` and store the resulting refresh token as `MICROSOFT_REFRESH_TOKEN`.

Delegated mode uses the signed-in user's `/me` mailbox and exists only to exercise the integration against a real development Inbox. It does not validate production shared-mailbox authorization. Refresh tokens must be stored as local or Worker secrets and never committed.

Create the Queue before deployment:

```bash
npx wrangler queues create shelter-surrender-triage
```

The Worker needs a public HTTPS URL before Graph can validate the subscription. Set `PUBLIC_BASE_URL` to that deployed Worker origin; the runtime uses `${PUBLIC_BASE_URL}/webhooks/graph` for both notification and lifecycle callbacks.

Configure these Worker variables:

| Name | Purpose | Default |
| --- | --- | --- |
| `MICROSOFT_AUTH_MODE` | `application` for production or `delegated` for personal-mailbox development | `application` |
| `MICROSOFT_TENANT_ID` | Microsoft tenant ID, or `consumers` for delegated personal accounts | required |
| `MICROSOFT_CLIENT_ID` | Entra application/client ID | required |
| `OUTLOOK_SHARED_MAILBOX` | Shared mailbox object ID or SMTP address | application mode only |
| `TRIAGE_EXACT_SENDER` | Exact form sender address | required |
| `TRIAGE_EXACT_SUBJECT` | Exact form message subject | required |
| `SURRENDER_FOLDER_NAME` | Destination Outlook folder | `Surrender Requests` |
| `PUBLIC_BASE_URL` | Public Worker origin, without the webhook path | required |
| `TYPESAFE_MODEL` | TypeSafe model | `jev-1.13.0` |
| `RECONCILIATION_LOOKBACK_MINUTES` | Recent Inbox recovery window | `180` |
| `RECONCILIATION_MAX_MESSAGES` | Maximum messages scanned per scheduled run | `250` |

Store these values as encrypted Worker secrets, never plain variables or repository files:

| Name | Purpose |
| --- | --- |
| `MICROSOFT_CLIENT_SECRET` | Entra application credential; application mode only |
| `MICROSOFT_REFRESH_TOKEN` | Personal-account OAuth refresh token; delegated mode only |
| `GRAPH_WEBHOOK_CLIENT_STATE` | Shared secret used to authenticate Graph notification payloads |
| `TYPESAFE_API_KEY` | TypeSafe API credential |

```bash
npx wrangler secret put MICROSOFT_CLIENT_SECRET
npx wrangler secret put GRAPH_WEBHOOK_CLIENT_STATE
npx wrangler secret put TYPESAFE_API_KEY
```

For a delegated development deployment, set `MICROSOFT_REFRESH_TOKEN` instead of `MICROSOFT_CLIENT_SECRET`.

`GRAPH_WEBHOOK_CLIENT_STATE` should be a generated high-entropy value. The Graph client secret and TypeSafe key are issued by their respective services. The application pins `jev-1.13.0` by default rather than following a moving model alias.

On the first scheduled run, Graph calls the webhook with a validation token while the Worker creates its subscription. No separate provisioning command is needed.

## Development

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run dev
```

The Worker is available at `http://localhost:8787` by default. Its health endpoint is `GET /health`. Graph webhook delivery requires a public deployed URL; local development does not provision a production subscription.

To generate Cloudflare types, verify the project, or build a deployment bundle:

```bash
bun run cf-typegen
bun run typecheck
bun test
bun run build
```

To deploy after authenticating Wrangler with Cloudflare:

```bash
bun run deploy
```
