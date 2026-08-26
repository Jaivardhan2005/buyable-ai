import { AttributeKey, IssueSeverity, MerchantStatus, TransactionStatus, VerificationStatus } from "../../generated/prisma";
import { calculateReadinessScore, type ReadinessInput } from "@/lib/readiness-rubric";

const INVENTORY_FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;
const checkoutReadyStatuses = new Set<string>([TransactionStatus.PENDING_PAYMENT, TransactionStatus.AUTHENTICATED, TransactionStatus.CAPTURED]);

export type ReadinessIssue = {
  code: string;
  severity: IssueSeverity;
  title: string;
  evidence: Record<string, unknown>;
  safeFix?: { action: string };
};

export type ReadinessProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  description: string;
  pricePaise: bigint;
  currency: string;
  status: string;
  inventory: { availableQty: number; reservedQty: number; updatedAt: Date } | null;
  attributes: { key: string; normalizedScore: number | null }[];
};

export type ReadinessMerchantSnapshot = {
  id: string;
  status: string;
  products: ReadinessProduct[];
  policies: { id: string; policyType: string; content: string; structuredRules: unknown }[];
  transactions: {
    id: string;
    amountPaise: bigint;
    currency: string;
    status: string;
    idempotencyKey: string;
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    confirmedAt: Date | null;
    paymentEvents: { verificationStatus: string }[];
  }[];
};

export type MerchantReadiness = {
  merchantId: string;
  assessedAt: Date;
  dimensions: ReadinessInput;
  score: number;
  issues: ReadinessIssue[];
};

function percentage(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

function hasText(value: string) {
  return value.trim().length > 0;
}

function hasStructuredRules(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "object" && value !== null && Object.keys(value).length > 0;
}

function hasValidCurrency(currency: string) {
  return /^[A-Z]{3}$/.test(currency);
}

function sortedProductIdentifiers(products: ReadinessProduct[]) {
  return products.map((product) => ({ id: product.id, sku: product.sku })).sort((left, right) => left.sku.localeCompare(right.sku) || left.id.localeCompare(right.id));
}

function createIssue(code: string, severity: IssueSeverity, title: string, evidence: Record<string, unknown>, safeFix?: string): ReadinessIssue {
  return { code, severity, title, evidence, ...(safeFix ? { safeFix: { action: safeFix } } : {}) };
}

/**
 * Evaluates a merchant snapshot without writing to the database. Pass a fixed assessedAt
 * when a reproducible assessment is required, such as in tests or future persistence.
 */
export function evaluateMerchantReadiness(snapshot: ReadinessMerchantSnapshot, assessedAt: Date): MerchantReadiness {
  const issues: ReadinessIssue[] = [];
  const products = [...snapshot.products].sort((left, right) => left.sku.localeCompare(right.sku) || left.id.localeCompare(right.id));
  const publishedProducts = products.filter((product) => product.status === "PUBLISHED");

  if (snapshot.status !== MerchantStatus.ACTIVE) {
    issues.push(createIssue("MERCHANT_INACTIVE", IssueSeverity.BLOCKER, "Merchant is not active", { merchantId: snapshot.id, status: snapshot.status }));
  }

  const requiredFields = [
    ["sku", (product: ReadinessProduct) => hasText(product.sku)],
    ["name", (product: ReadinessProduct) => hasText(product.name)],
    ["brand", (product: ReadinessProduct) => hasText(product.brand)],
    ["description", (product: ReadinessProduct) => hasText(product.description)],
    ["pricePaise", (product: ReadinessProduct) => product.pricePaise > 0n],
    ["currency", (product: ReadinessProduct) => hasValidCurrency(product.currency)],
    ["status", (product: ReadinessProduct) => product.status === "PUBLISHED"],
  ] as const;
  const invalidProducts = products.flatMap((product) => {
    const missingFields = requiredFields.filter(([, isValid]) => !isValid(product)).map(([field]) => field);
    return missingFields.length === 0 ? [] : [{ id: product.id, sku: product.sku, fields: missingFields }];
  });
  const catalogCompleteness = percentage(products.length * requiredFields.length - invalidProducts.reduce((total, product) => total + product.fields.length, 0), products.length * requiredFields.length);

  if (products.length === 0) {
    issues.push(createIssue("CATALOG_NO_PRODUCTS", IssueSeverity.BLOCKER, "Merchant has no products", { merchantId: snapshot.id }, "Add catalog records through the merchant catalog workflow."));
  } else if (invalidProducts.length > 0) {
    issues.push(createIssue("CATALOG_REQUIRED_FIELDS_MISSING", IssueSeverity.WARNING, "Some products are incomplete or unpublished", { products: invalidProducts }, "Review the listed fields before publishing affected products."));
  }

  const attributeKeys = Object.values(AttributeKey);
  const attributeFailures = publishedProducts.flatMap((product) => attributeKeys.filter((key) => !product.attributes.some((attribute) => attribute.key === key && Number.isInteger(attribute.normalizedScore) && attribute.normalizedScore !== null && attribute.normalizedScore >= 0 && attribute.normalizedScore <= 100)).map((key) => ({ id: product.id, sku: product.sku, key })));
  const attributeQuality = percentage(publishedProducts.length * attributeKeys.length - attributeFailures.length, publishedProducts.length * attributeKeys.length);

  if (publishedProducts.length > 0 && attributeFailures.length > 0) {
    issues.push(createIssue("ATTRIBUTE_QUALITY_INCOMPLETE", IssueSeverity.WARNING, "Published products need complete normalized attributes", { attributes: attributeFailures }, "Review the listed attribute values; do not infer product facts without merchant confirmation."));
  }

  const inventoryMissing = publishedProducts.filter((product) => product.inventory === null);
  const inventoryStale = publishedProducts.filter((product) => product.inventory !== null && (product.inventory.availableQty < 0 || product.inventory.reservedQty < 0 || assessedAt.getTime() - product.inventory.updatedAt.getTime() > INVENTORY_FRESHNESS_WINDOW_MS));
  const freshInventoryCount = publishedProducts.length - inventoryMissing.length - inventoryStale.length;
  const inventoryFreshness = percentage(freshInventoryCount, publishedProducts.length);

  if (inventoryMissing.length > 0) {
    issues.push(createIssue("INVENTORY_MISSING", IssueSeverity.BLOCKER, "Published products are missing inventory", { products: sortedProductIdentifiers(inventoryMissing) }, "Add or verify inventory records through the merchant inventory workflow."));
  }
  if (inventoryStale.length > 0) {
    issues.push(createIssue("INVENTORY_STALE_OR_INVALID", IssueSeverity.WARNING, "Some inventory is stale or invalid", { products: sortedProductIdentifiers(inventoryStale), freshnessWindowHours: 24 }, "Refresh the listed inventory records; do not change quantities automatically."));
  }

  const invalidPolicies = [...snapshot.policies].filter((policy) => !hasText(policy.content) || !hasStructuredRules(policy.structuredRules)).sort((left, right) => left.policyType.localeCompare(right.policyType) || left.id.localeCompare(right.id));
  const policyClarity = percentage(snapshot.policies.length - invalidPolicies.length, snapshot.policies.length);

  if (snapshot.policies.length === 0) {
    issues.push(createIssue("POLICY_ACTIVE_MISSING", IssueSeverity.BLOCKER, "Merchant has no active policies", { merchantId: snapshot.id }, "Add and explicitly approve merchant policy content and structured rules."));
  } else if (invalidPolicies.length > 0) {
    issues.push(createIssue("POLICY_ACTIVE_INCOMPLETE", IssueSeverity.WARNING, "Some active policies lack clear content or structured rules", { policies: invalidPolicies.map((policy) => ({ id: policy.id, policyType: policy.policyType })) }, "Review policy content and structured rules with the merchant; do not activate or alter commercial terms automatically."));
  }

  const checkoutTransactions = snapshot.transactions.filter((transaction) => transaction.razorpayOrderId !== null && checkoutReadyStatuses.has(transaction.status));
  const checkoutReadiness = checkoutTransactions.length > 0 ? 100 : 0;
  if (checkoutReadiness === 0) {
    issues.push(createIssue("CHECKOUT_NOT_READY", IssueSeverity.BLOCKER, "No server-created checkout order is available", { qualifyingTransactionCount: 0 }, "Configure and test checkout through the server-side payment workflow; do not enable it automatically."));
  }

  const unsafeTransactions = snapshot.transactions.filter((transaction) => {
    const hasBaseControls = hasText(transaction.idempotencyKey) && transaction.amountPaise > 0n && hasValidCurrency(transaction.currency);
    if (transaction.status !== TransactionStatus.CAPTURED) return !hasBaseControls;
    return !hasBaseControls || transaction.razorpayOrderId === null || transaction.razorpayPaymentId === null || transaction.confirmedAt === null || !transaction.paymentEvents.some((event) => event.verificationStatus === VerificationStatus.VERIFIED);
  }).sort((left, right) => left.id.localeCompare(right.id));
  const transactionSafety = percentage(snapshot.transactions.length - unsafeTransactions.length, snapshot.transactions.length);
  if (transactionSafety < 100) {
    issues.push(createIssue("TRANSACTION_SAFETY_INCOMPLETE", IssueSeverity.BLOCKER, "Transaction safety evidence is incomplete", { transactionCount: snapshot.transactions.length, unsafeTransactionIds: unsafeTransactions.map((transaction) => transaction.id) }, "Review server-side idempotency and verified payment evidence; do not mark transactions paid automatically."));
  }

  const dimensions = { catalogCompleteness, attributeQuality, inventoryFreshness, policyClarity, checkoutReadiness, transactionSafety };
  return { merchantId: snapshot.id, assessedAt, dimensions, score: calculateReadinessScore(dimensions), issues };
}
