import { PrismaClient, AttributeKey, AttributeSource, ProductStatus } from "../generated/prisma";
import { demoCatalog, demoMerchant } from "../src/lib/demo-catalog";

const prisma = new PrismaClient();

async function main() {
  const merchant = await prisma.merchant.upsert({
    where: { slug: demoMerchant.slug },
    update: { name: demoMerchant.name },
    create: { name: demoMerchant.name, slug: demoMerchant.slug },
  });

  for (const product of demoCatalog) {
    await prisma.product.upsert({
      where: { merchantId_sku: { merchantId: merchant.id, sku: product.sku } },
      update: { name: product.name, brand: product.brand, description: product.description, pricePaise: product.pricePaise },
      create: {
        merchantId: merchant.id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        description: product.description,
        pricePaise: product.pricePaise,
        status: ProductStatus.PUBLISHED,
      },
    }).then(async (record) => {
      await prisma.inventory.upsert({
        where: { productId: record.id },
        update: { availableQty: product.availableQty },
        create: { productId: record.id, availableQty: product.availableQty },
      });
      await Promise.all(Object.entries(product.attributes).map(([key, normalizedScore]) => prisma.productAttribute.upsert({
        where: { productId_key: { productId: record.id, key: key as AttributeKey } },
        update: { normalizedScore },
        create: { productId: record.id, key: key as AttributeKey, valueJson: { normalizedScore }, normalizedScore, source: AttributeSource.MERCHANT },
      })));
    });
  }
}

main().finally(() => prisma.$disconnect());
