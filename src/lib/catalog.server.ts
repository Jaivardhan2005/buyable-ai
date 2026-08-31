import { toRankingProducts, type Catalog, publishedCatalogQuery } from "@/lib/catalog";
import { demoCatalog, demoMerchant } from "@/lib/demo-catalog";
import { prisma } from "@/lib/prisma";

export async function getPublishedCatalog(): Promise<Catalog> {
  try {
    const products = await prisma.product.findMany(publishedCatalogQuery);
    if (products.length > 0) {
      const firstMerchant = products[0]?.merchant;
      const rankingProducts = toRankingProducts(products);
      if (rankingProducts.length > 0) {
        return {
          merchant: firstMerchant
            ? { id: firstMerchant.id, name: firstMerchant.name, slug: firstMerchant.slug }
            : { id: "demo-merchant-id", name: demoMerchant.name, slug: demoMerchant.slug },
          products: rankingProducts,
        };
      }
    }
  } catch (error) {
    console.warn("Prisma catalog fetch failed, using demo catalog fallback:", error);
  }

  return {
    merchant: { id: "demo-merchant-id", name: demoMerchant.name, slug: demoMerchant.slug },
    products: demoCatalog,
  };
}
