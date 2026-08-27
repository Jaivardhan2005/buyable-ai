import assert from "node:assert/strict";
import test from "node:test";
import { AttributeKey, AttributeSource, ProductStatus, type Prisma } from "../../generated/prisma";
import { publishedCatalogQuery, toRankingProducts } from "./catalog";

function productRecord(overrides: Partial<Prisma.ProductGetPayload<typeof publishedCatalogQuery>> = {}): Prisma.ProductGetPayload<typeof publishedCatalogQuery> {
  return {
    id: "product-id",
    merchantId: "merchant-id",
    sku: "SN-TEST",
    name: "Test Buds",
    brand: "SoundNest",
    description: "Test product",
    pricePaise: 199900n,
    currency: "INR",
    status: ProductStatus.PUBLISHED,
    sourceVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    inventory: { productId: "product-id", availableQty: 7, reservedQty: 0, reservationExpiresAt: null, updatedAt: new Date(), version: 1 },
    attributes: Object.values(AttributeKey).map((key, index) => ({ id: `${key}-id`, productId: "product-id", key, valueJson: { normalizedScore: 50 + index }, normalizedScore: 50 + index, source: AttributeSource.MERCHANT, confidence: null })),
    merchant: { id: "merchant-id", name: "SoundNest Electronics", slug: "soundnest-electronics" },
    ...overrides,
  };
}

test("catalog records map to the ranking model without changing persisted values", () => {
  const result = toRankingProducts([productRecord()]);

  assert.deepEqual(result, [{ sku: "SN-TEST", name: "Test Buds", brand: "SoundNest", description: "Test product", pricePaise: 199900n, availableQty: 7, attributes: { BATTERY_HOURS: 50, ANC_LEVEL: 51, BASS: 52, COMFORT: 53, MICROPHONE: 54, WATER_RESISTANCE: 55 } }]);
});

test("catalog mapping excludes unpublished and incomplete products", () => {
  const draft = productRecord({ sku: "SN-DRAFT", status: ProductStatus.DRAFT });
  const missingAttribute = productRecord({ sku: "SN-INCOMPLETE", attributes: productRecord().attributes.slice(1) });

  assert.deepEqual(toRankingProducts([draft, missingAttribute]), []);
});

test("published catalog query filters to published products from active merchants", () => {
  assert.deepEqual(publishedCatalogQuery.where, {
    status: ProductStatus.PUBLISHED,
    merchant: { status: "ACTIVE" },
  });
});
