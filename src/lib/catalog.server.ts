import { toRankingProducts, type Catalog, publishedCatalogQuery } from "@/lib/catalog";
import { demoCatalog, demoMerchant } from "@/lib/demo-catalog";
import { prisma, withDb } from "@/lib/prisma";

export async function getPublishedCatalog(): Promise<Catalog> {
  const fallbackCatalog: Catalog = {
    merchant: { id: "demo-merchant-id", name: demoMerchant.name, slug: demoMerchant.slug },
    products: demoCatalog,
  };

  return withDb(
    async () => {
      const products = await prisma.product.findMany(publishedCatalogQuery);
      if (products.length > 0) {
        const firstMerchant = products[0]?.merchant;
        const rankingProducts = toRankingProducts(products);
        if (rankingProducts.length > 0) {
          return {
            merchant: firstMerchant
              ? { id: firstMerchant.id, name: firstMerchant.name, slug: firstMerchant.slug }
              : fallbackCatalog.merchant,
            products: rankingProducts,
          };
        }
      }
      return fallbackCatalog;
    },
    () => fallbackCatalog
  );
}
