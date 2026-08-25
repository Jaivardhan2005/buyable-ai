# Internal API contract

All JSON routes validate with a shared schema library, return a correlation ID, and emit audit events for consequential calls. Merchant routes use authenticated user + merchant membership; buyer routes use a signed/opaque session cookie and ownership check. Error envelope: `{ "error": { "code": "VALIDATION_ERROR", "message": "safe user message", "details": [] }, "correlationId": "uuid" }` with 400 validation, 401 unauthenticated, 403 forbidden, 404 concealed/not found, 409 state/idempotency conflict, 422 guardrail blocked, 429 rate limit, and 502 provider unavailable.

| Route | Request → response | Authorization / notes |
|---|---|---|
| `POST /api/merchant/catalog/import` | multipart CSV → `{importId, acceptedRows, issues}` | merchant editor; prescribed headers; no direct publish on invalid rows |
| `POST /api/merchant/readiness/assess` | `{}` → `{assessmentId, score, issues, safeFixes}` | merchant member; server reads current snapshot |
| `POST /api/merchant/readiness/issues/:id/apply-safe-fix` | `{}` → `{resolution, change}` | merchant editor or scoped system action; only allowlisted noncommercial fixes |
| `POST /api/merchant/policies/:id/approve` | `{version}` → `{policy}` | merchant admin; activates reviewed commercial/policy proposal |
| `GET /api/merchant/audit` | query cursor/entity → `{items,nextCursor}` | tenant scoped, redacted |
| `POST /api/buyer/sessions` | `{merchantSlug}` → `{sessionId, initialQuestion}` | creates opaque session cookie; rate-limited |
| `POST /api/buyer/message` | `{message}` → `{reply, preferenceProposal?, nextAction}` | session owner; LLM output schema validated |
| `PUT /api/buyer/preferences` | `{preferences:[{key,value,rank?}]}` → `{preferences, nextAction}` | session owner; validates supported terms/ranks |
| `POST /api/buyer/recommendations` | `{}` → `{recommendationId, results, formulaVersion}` | session owner; deterministic only |
| `POST /api/buyer/cart` | `{productId,quantity:1}` → `{cart, guardrailResult}` | revalidates current catalog/stock/price |
| `POST /api/buyer/cart/confirm` | `{confirmationToken}` → `{confirmedAt, checkoutEligible}` | token represents explicit UI confirmation of server-rendered summary |
| `POST /api/payments/order` | `{idempotencyKey}` → `{transactionId, razorpayOrderId, keyId, amountPaise,currency}` | confirmed session/cart only; creates Razorpay Order server-side |
| `POST /api/payments/verify` | `{paymentId,signature}` → `{transaction,status}` | uses the locally stored server-created Razorpay order ID—not a browser-supplied order ID—for timing-safe HMAC verification; verifies provider payment/order state server-side before a transaction can be successful |
| `POST /api/webhooks/razorpay` | raw body + signature → `200` | no session; raw-body signature verification and `provider_event_id` deduplication are mandatory; idempotently handles `payment.captured`, `payment.failed`, and `order.paid` |
| `GET /api/buyer/audit` | cursor → `{items,nextCursor}` | session-scoped, customer-safe subset |

Internal tool interfaces are functions, not public endpoints: `searchCatalog({merchantId, budgetPaise, filters})`, `getPolicyFacts({merchantId})`, `savePreferenceProposal({sessionId, proposal})`, and `getRecommendationFacts({recommendationId})`. Each runs authorization/schema checks and returns canonical records only. The LLM never sees a database client or Razorpay key.

Razorpay boundary: `PaymentService.createOrder` is the only server module using secret credentials. It maps an already-calculated integer amount and local transaction receipt to Razorpay’s Orders API. The client opens Razorpay Standard Checkout using the public key and server-created Razorpay Order. Verification uses the locally stored order ID, payment ID and secret; the server verifies payment/order state before marking a transaction successful. Webhook verification uses the raw request body and webhook secret, supports `payment.captured`, `payment.failed`, and `order.paid`, and deduplicates `provider_event_id` before applying an idempotent state transition. Reconcile duplicate, delayed, or missed events using provider-state lookup and transaction transition locks. Current implementation must be checked against the [official Standard Checkout documentation](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) before wiring it.
