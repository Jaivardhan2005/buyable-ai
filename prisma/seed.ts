import { PrismaClient, AttributeKey, AttributeSource, PolicyStatus, ProductStatus } from "../generated/prisma";
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
      update: { name: product.name, brand: product.brand, description: product.description, pricePaise: product.pricePaise, category: product.category },
      create: {
        merchantId: merchant.id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        description: product.description,
        pricePaise: product.pricePaise,
        category: product.category,
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

  await prisma.merchantPolicy.upsert({
    where: { merchantId_policyType_version: { merchantId: merchant.id, policyType: "RETURNS", version: 1 } },
    update: {},
    create: {
      merchantId: merchant.id,
      policyType: "RETURNS",
      content: "Products may be returned within 7 days of delivery if unused and in original packaging. Refunds are processed within 5 business days after inspection.",
      structuredRules: { returnWindowDays: 7, conditionRequired: "unused", refundProcessingDays: 5 },
      status: PolicyStatus.ACTIVE,
      version: 1,
    },
  });
}

main().finally(() => prisma.$disconnect());
