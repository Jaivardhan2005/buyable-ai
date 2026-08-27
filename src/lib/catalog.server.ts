

import { toRankingProducts, type Catalog } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { publishedCatalogQuery } from "@/lib/catalog";

export async function getPublishedCatalog(): Promise<Catalog> {
  const products = await prisma.product.findMany(publishedCatalogQuery);
  const firstMerchant = products[0]?.merchant;

  return {
    merchant: firstMerchant ? { id: firstMerchant.id, name: firstMerchant.name, slug: firstMerchant.slug } : null,
    products: toRankingProducts(products),
  };
}
