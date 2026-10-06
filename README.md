# Shopify ↔ SSLCommerz payment middleware

A Node.js/TypeScript service that lets a Shopify store take payments through
[SSLCommerz](https://www.sslcommerz.com/), the Bangladeshi payment gateway. It runs in
production for the Jolly Phonics Bangladesh store, hosted on Render's free tier.

Shopify's checkout can't call SSLCommerz directly, so the store's cart sends customers to
this service instead. The service creates a Shopify draft order, hands the customer to
SSLCommerz, verifies the payment with SSLCommerz's own validation API, and only then turns
the draft into a paid order.

## Payment flow

```text
Cart page ("Online Payment" button, Liquid)
   │  1. wake-up request to this service (hides the free-tier cold start)
   ▼
Checkout form (shipping details)
   │  2. POST /api/v1/payment/init
   ▼
This service ── creates a Shopify draft order, stores a payment session (status: pending)
   │  3. GET /api/v1/payment/redirect/:transactionId → SSLCommerz session → gateway page
   ▼
SSLCommerz ── customer pays
   │  4. POST /api/v1/payment/ipn   (server to server)
   ▼
This service ── verifies the payment (below), completes the draft order in Shopify,
                records the payment, marks the session success, emails the customer
   │  5. customer returns to /payment/success or /payment/fail
```

## How a payment is verified

The IPN handler trusts nothing in the notification body on its own. Before an order is
completed:

1. The session for the notification's transaction ID must exist and not be past its expiry.
   An expired session's draft order is deleted.
2. The notification's `tran_id` must match the session's transaction ID.
3. The notification's status must be `VALID` or `VALIDATED`.
4. The service calls SSLCommerz's validation API with the `val_id` and the store
   credentials, then checks the API's answer:
   - status is `VALID` or `VALIDATED`
   - amount matches the session within ±0.01 BDT (absorbs floating-point rounding)
   - `tran_id` matches the session and a `bank_tran_id` is present
5. Only then is the draft order completed in Shopify and a `payments` record written.

A repeated IPN for a session already marked `success` is acknowledged without being
processed again. Each IPN outcome (received, failed, expired, completed) is written to a
`payment_events` collection for auditing.

An IP allowlist (`SSL_IPS`) on the IPN route adds a further check; the validation API call
in step 4 is what actually proves a payment.

## Why orders are recorded as manual payments

The draft order is completed through the Admin API and marked paid, so Shopify records it
as a manual-payment order. Manual-payment orders don't incur Shopify's third-party
transaction fee, which would otherwise apply to an external gateway.

## Hosting on Render's free tier

Free-tier services sleep after 15 minutes without traffic and take roughly 50 seconds to
wake. The cart's "Online Payment" button sends a background request to wake the service
while the customer fills in shipping details, so the boot time is hidden behind the form.
The 15-minute sleep timer matches SSLCommerz's 15-minute session window, so the service
stays awake to receive the IPN.

## Fields sent to SSLCommerz for reconciliation

| Field | Value | Used for |
|---|---|---|
| `tran_id` | session transaction ID | matching the payment to its session |
| `value_a` | `JOLLY_PHONICS_BANGLADESH` | filtering this store's payments in the merchant panel |
| `value_b` | session transaction ID | looking up the session when the IPN arrives |
| `value_c` | `PHYSICAL_BOOKS` | product category for accounting |
| `value_d` | customer email | customer lookup |

## Running locally

Requires Node.js 24.

```bash
npm install
cp .env.example .env   # then fill in the values below
npm run dev
```

| Variable | Meaning |
|---|---|
| `PORT` | HTTP port |
| `NODE_ENV` | `development` or `production` |
| `DB_URL` | MongoDB connection string |
| `BASE_URL` | public URL of this service (used for SSLCommerz callbacks) |
| `ORIGINS` | comma-separated origins allowed by CORS |
| `SHOPIFY_STORE` | `your-store.myshopify.com` |
| `SHOPIFY_ADMIN_TOKEN` | Admin API token, scoped to `write_draft_orders` and `write_orders` only |
| `SHOPIFY_API_VERSION` | e.g. `2026-01` |
| `SSL_ENV` | `securepay` for live payments; anything else uses the sandbox |
| `SSL_STORE_ID`, `SSL_STORE_PASS` | SSLCommerz store credentials |
| `SSL_IPS` | comma-separated SSLCommerz IPN source IPs |
| `BREVO_API_KEY`, `BREVO_VERIFIED_EMAIL` | transactional email for payment confirmations |

## Tests

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
```

The tests cover payment verification (`validateSSLPayment`): accepted statuses, the amount
tolerance, transaction ID and bank transaction ID checks, and failure of the validation API.
They mock SSLCommerz, so no credentials are needed. CI runs type checking, tests and the
build on every push and pull request.

## Project layout

```text
src/
  app.ts                   Express app: CORS, Helmet, HPP, rate limiting, sanitisation
  controller/              init, redirect, IPN, success and fail handlers
  service/ssl.service.ts   SSLCommerz session creation and payment validation
  service/shopify.service.ts  draft order create / complete / delete
  middleware/              IPN IP allowlist, input sanitisation
  model/                   payment sessions, payments, payment events
test/                      vitest tests
```

## Author

Mezbaur Are Rafi · [GitHub](https://github.com/mezbaur2004)
