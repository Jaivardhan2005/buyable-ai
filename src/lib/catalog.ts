import type { DemoAttribute, DemoProduct } from "@/lib/demo-catalog";
import { AttributeKey, MerchantStatus, ProductStatus, type Prisma } from "../../generated/prisma";

const publishedProductQuery = {
  where: {
    status: ProductStatus.PUBLISHED,
    merchant: { status: MerchantStatus.ACTIVE },
  },
  include: {
    inventory: true,
    attributes: true,
    merchant: { select: { id: true, name: true, slug: true } },
  },
  orderBy: { sku: "asc" },
} satisfies Prisma.ProductFindManyArgs;

export type PublishedProductRecord = Prisma.ProductGetPayload<typeof publishedProductQuery>;

export type Catalog = {
  merchant: { id: string; name: string; slug: string } | null;
  products: DemoProduct[];
};

/** Converts persisted product facts into the model consumed by the ranking formula. */
export function toRankingProduct(product: PublishedProductRecord): DemoProduct | null {
  if (product.status !== ProductStatus.PUBLISHED || !product.inventory) return null;

  const attributes: Partial<Record<DemoAttribute, number>> = {};

  for (const attribute of product.attributes) {
    if (attribute.normalizedScore === null || !Number.isFinite(attribute.normalizedScore)) return null;
    attributes[attribute.key as DemoAttribute] = attribute.normalizedScore;
  }

  const requiredAttributes = Object.values(AttributeKey) as DemoAttribute[];
  if (!requiredAttributes.every((key) => typeof attributes[key] === "number")) return null;

  return {
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    description: product.description,
    pricePaise: product.pricePaise,
    availableQty: product.inventory.availableQty,
    category: product.category || "unspecified",
    attributes: attributes as Record<DemoAttribute, number>,
  };
}

export function toRankingProducts(products: PublishedProductRecord[]) {
  return products.filter((product) => product.status === ProductStatus.PUBLISHED).map(toRankingProduct).filter((product): product is DemoProduct => product !== null);
}

export const publishedCatalogQuery = publishedProductQuery;
