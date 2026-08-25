# BuyableAI architecture

## Understanding, assumptions, and choices

BuyableAI is a merchant-side AI-commerce readiness layer, not a general shopping chatbot. It ingests a small electronics catalog and policies, converts them to an agent-readable canonical model, measures whether an AI buyer can safely buy from that merchant, fixes only safe data gaps, then powers one bounded buyer journey: discover earbuds, compare deterministically, explicitly confirm, and pay.

Assumptions: one demo merchant; Indian rupees and one currency; authenticated merchant users; an anonymous customer session with a server-issued opaque ID; a seeded/uploaded CSV catalog; one-item cart; Razorpay Standard Checkout in test mode; delivery/tax are either fixed, displayed inputs or excluded from the demo. The merchant owns catalog and policies. “AI-ready” means data/process readiness, not a certification or a promise of third-party agent compatibility.

Ambiguities resolved simply: catalog upload accepts a prescribed CSV template (not arbitrary PDFs); policy upload accepts short text plus merchant-confirmed structured fields; preference ranking is a fixed 1–5 ordering of supported attributes; product fulfillment is a recorded demo state after a verified payment, not logistics; automatic fixes only normalize values, derive missing supported fields where source data is unambiguous, and never alter commercial facts.

## Product and differentiation

Common AI-shopping experiences can parse a request and suggest products. Generic agentic-commerce plumbing can expose a catalog and a checkout. BuyableAI’s differentiated value is **Proof of Buyability**: an explainable readiness assessment that connects merchant data quality, agent permissions, transaction guardrails, and payment evidence to each purchase. The signature feature is the *Buyability Passport*: a versioned, auditable readiness report with concrete blockers and safe fixes, linked to the buyer’s eventual transaction. Its score is a deterministic weighted/rubric-based calculation, not an unexplained number: the report visibly breaks down catalog completeness, product-attribute quality, inventory freshness, policy clarity, checkout readiness, and transaction-safety controls, showing earned/possible points, weights, evidence, and rubric version for every dimension.

This is meaningful for Razorpay because more agent-readable merchants and safer conversational checkout can create qualified purchase intent. Razorpay naturally supplies the payment-order and checkout boundary; BuyableAI does not claim an autonomous Razorpay agent API. Verify supported Checkout options, capture configuration, test cards/UPI, webhook setup, and account eligibility during implementation. Razorpay’s documented Standard Checkout flow is server order creation → browser Checkout → server signature verification → captured-payment/webhook confirmation; browser success alone is never fulfillment truth ([Razorpay Standard Checkout guide](https://razorpay.com/docs/developer-tools/integrations/standard-checkout/)).

## System architecture

One Next.js TypeScript modular monolith: browser UI → route handlers/server actions → domain services → PostgreSQL through Prisma. A server-only LLM adapter interprets untrusted language into validated structured proposals. Razorpay is the only payment provider. No microservices, vector DB, workflow engine, autonomous background agents, background queue, or worker are required in the MVP.

| Component | Responsibility |
|---|---|
| Merchant Console | CSV/policy submission, readiness report, review/approve pending changes, audit view |
| Catalog service | validates, normalizes and persists products/attributes/inventory; exposes whitelisted search fields |
| Readiness service | deterministic rubric, issue generation, safe fix application and report versioning |
| Buyer conversation service | session state, LLM-assisted intent/preference extraction, follow-up question selection |
| Recommendation engine | filters eligibility and ranks snapshot products with a fixed published formula |
| Policy/guardrail service | evaluates deterministic availability, total, limits and confirmation state |
| Payment service | creates local transaction + Razorpay Order, verifies callback and webhook signatures, applies idempotent state transitions |
| Audit service | append-only event trail for user, agent, system, policy and payment decisions |
| LLM adapter | schema-bound extraction/explanation only; no direct DB writes, payment calls, or authority |

## Flows

**Merchant:** authenticate → upload CSV and policy form/text → validate and store raw source reference plus canonical records → run deterministic readiness rubric → record issues → apply safe fixes with before/after audit events → present merchant-approval queue for every commercial/policy-impacting proposal → publish current assessment.

**Buyer:** create opaque session → customer request → LLM returns validated intent/preferences or a clarification need → server persists preferences → deterministic catalog filter (published, in stock, budget) → rank top three from attribute snapshot → LLM may explain only supplied ranking facts → customer chooses item → re-evaluate guardrails → present immutable price/quantity/merchant summary → explicit confirm → create payment order.

Ranking is reproducible: exclude unavailable/out-of-budget items; normalize each supported attribute to 0–100 by documented catalog scale; calculate `score = Σ(preferenceWeight × attributeScore) / Σ(preferenceWeight)`; apply deterministic tie-breakers: lower price, higher stock, stable product ID. Store formula version, inputs, candidate IDs, weights, scores and product-price snapshot with each recommendation.

**Payment:** after confirmation, begin an idempotent transaction using a client idempotency key; re-check stock/price/policies atomically; create local `PENDING_PAYMENT` transaction and Razorpay Order server-side; send only public key/order details/amount to client; open Standard Checkout from a customer click; receive callback result; verify HMAC server-side against the locally stored Razorpay order ID and verify provider payment/order state before success; record payment event. MVP webhook handling is lightweight, synchronous, and idempotent: verify the raw-body signature, deduplicate the provider event ID, apply only a short local state transition for `payment.captured`, `payment.failed`, or `order.paid`, and return. No background queue or worker is required. Reconciliation checks delayed or missed provider events during a safe transaction-status refresh. Mark paid/fulfillable only at the selected verified/captured state; otherwise retain pending/failed and show retry/recovery.

**Failure and recovery demo:** select an out-of-stock product or exceed a demo per-order limit after recommendation. The guardrail blocks order creation, logs `GUARDRAIL_BLOCKED`, explains the exact deterministic rule, refreshes candidates and lets the buyer select another item. A payment failure/abandonment keeps the cart and transaction attempt, never creates fulfillment, and offers a new idempotent attempt after a fresh check.

## Boundaries, trust, and safety

Browser input, uploaded catalog/policy text, LLM output, and Razorpay callbacks are untrusted. Route handlers authenticate/authorize, validate schemas, rate limit sensitive endpoints, and call domain services. PostgreSQL data is trusted only after validation; audit records are append-only to application roles. Secrets, raw webhook bodies, and payment verification execute server-side only.

Merchant role can manage only its merchant/catalog/policies and approve proposed commercial changes. Customer session can access only its session/cart/transactions. System actor can apply explicitly allowlisted safe fixes. The AI Buyer has read-only catalog/policy tools plus `propose_preferences`, `request_clarification`, and `explain_recommendation`; it cannot mutate product, stock, prices, rules, transactions, or payment status. Payment service alone calls Razorpay.

LLM outputs must match JSON Schema, be length-limited, and be treated as suggestions. The prompt supplies only retrieved canonical records; product facts and numeric claims are independently checked against tool output before rendering. Score, pricing, stock, limits, eligibility and payment outcomes come only from deterministic services. Catalog text is data-delimited, never treated as instructions; strip/flag prompt-like content and use fixed system instructions.

Every consequential action emits an audit event with correlation ID, actor, action, entity, input/output hashes or redacted payload, policy/ranking version, outcome, timestamp and reason. Payment events retain provider IDs and verification result, never secrets or full card data.

## MVP and scope

**Must have:** prescribed catalog ingestion; canonical earbuds catalog; readiness score/issues/safe fixes; one buyer conversation with preference clarification; deterministic top-3 ranking; explicit confirmation; Razorpay test Checkout; verified payment state; audit timeline; blocked-stock/limit recovery.

**Should have:** merchant approval queue, CSV error download, webhook receiver, shareable Buyability Passport.

**Nice to have:** multiple merchants, analytics dashboard, richer policy extraction, refund flow, multi-item cart.

**Do not build:** autonomous purchasing without confirmation, arbitrary-document RAG, marketplace aggregation, recommendations learned from behavior, logistics, coupons, refunds, multi-currency, microservices, vector databases.

## Metrics

Measure—not invent—these: readiness score from rubric points earned/possible; catalog completeness from required valid fields / required fields; recommendation reproducibility by re-running saved input and comparing ordered IDs/scores; completion rate from sessions reaching verified payment / sessions starting buyer flow; recovery rate from blocked/failed attempts later reaching a terminal safe outcome; unsafe-action blocking from denied guardrail attempts / guardrail attempts; audit coverage from consequential actions with an audit event / consequential actions. Show numerator, denominator, period and exclusions.

## Seven-day fit and review

Architecture decision summary: modular monolith minimizes setup; PostgreSQL provides transactional truth; LLM is constrained interpretation; deterministic engines decide money/product truth; Razorpay remains payment authority; a passport/audit model provides the judge-facing differentiation.

Biggest risks: Razorpay account/webhook readiness; CSV data quality; LLM structured-output reliability; state-machine/idempotency bugs; attempting too much UI/approval scope. Scope cuts in order: policy text extraction (use form), approval queue, shareable passport, and all non-earbud attributes. Retain lightweight webhook verification and reconciliation; a queue/worker architecture is outside the MVP.

**Final judge demo:** a merchant uploads an earbud catalog, receives and improves a versioned Buyability Passport, then a buyer states a need, ranks preferences, receives an explainable deterministic recommendation, is stopped safely on one invalid attempt, confirms a valid choice, completes Razorpay test Checkout, and sees an end-to-end audit trail proving what the AI could—and could not—do.
