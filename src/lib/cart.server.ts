import { randomUUID } from "crypto";
import { prisma, withDb } from "@/lib/prisma";
import { CartStatus, ProductStatus, ActorType } from "../../generated/prisma";
import { demoCatalog, DemoProduct } from "@/lib/demo-catalog";
import { CartError, CartItemSummary, CartSummary, AddCartItemInput } from "./cart";
import { recordAuditEvent } from "./audit.server";

// Fallback in-memory active cart store for local dev / offline DB resilience
type MemoryCartItem = {
  id: string;
  sessionId: string;
  merchantId: string;
  productId: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  unitPricePaise: bigint;
  quantity: number;
  status: CartStatus;
  createdAt: Date;
  updatedAt: Date;
};

const memoryCartStore = new Map<string, MemoryCartItem[]>();

function getDemoProductBySkuOrId(skuOrId?: string): DemoProduct | undefined {
  if (!skuOrId) return undefined;
  return demoCatalog.find(
    (p) => p.sku === skuOrId || p.sku.toLowerCase() === skuOrId.toLowerCase()
  );
}

function getDemoFallbackProduct(sku?: string, productId?: string, merchantId?: string) {
  const target = sku
    ? getDemoProductBySkuOrId(sku)
    : productId
    ? demoCatalog.find((p) => p.sku === productId || productId.includes(p.sku))
    : undefined;

  if (!target) return null;

  return {
    id: "demo-prod-" + target.sku,
    merchantId: merchantId || "merchant-demo-001",
    sku: target.sku,
    name: target.name,
    brand: target.brand,
    category: target.category,
    description: target.description,
    pricePaise: target.pricePaise,
    status: ProductStatus.PUBLISHED,
    availableQty: target.availableQty,
  };
}

export async function getAuthoritativeProduct(params: {
  sku?: string;
  productId?: string;
  merchantId?: string;
}) {
  const { sku, productId, merchantId } = params;

  return withDb(
    async () => {
      let product = null;
      if (productId && !productId.startsWith("demo-prod-")) {
        product = await prisma.product.findUnique({
          where: { id: productId },
          include: { inventory: true },
        });
      } else if (sku && merchantId) {
        product = await prisma.product.findUnique({
          where: { merchantId_sku: { merchantId, sku } },
          include: { inventory: true },
        });
      }

      if (product) {
        return {
          id: product.id,
          merchantId: product.merchantId,
          sku: product.sku,
          name: product.name,
          brand: product.brand,
          category: product.category || "audio",
          description: product.description,
          pricePaise: product.pricePaise,
          status: product.status,
          availableQty: product.inventory?.availableQty ?? 0,
        };
      }
      return getDemoFallbackProduct(sku, productId, merchantId);
    },
    () => getDemoFallbackProduct(sku, productId, merchantId)
  );
}

function formatMemoryCart(sessionId: string): CartSummary {
  const sessionCarts = (memoryCartStore.get(sessionId) || []).filter(
    (c) => c.status === CartStatus.ACTIVE
  );

  const items: CartItemSummary[] = [];
  const warnings: string[] = [];
  let subtotal = 0n;
  let totalQty = 0;

  for (const cart of sessionCarts) {
    const targetProd = getDemoProductBySkuOrId(cart.sku);
    const availableQty = targetProd?.availableQty ?? 10;
    const isAvailable = availableQty >= cart.quantity;
    const lineTotal = cart.unitPricePaise * BigInt(cart.quantity);

    let stockWarning: string | undefined;
    if (availableQty < cart.quantity) {
      stockWarning = `Only ${availableQty} units available.`;
      warnings.push(`${cart.name}: requested quantity exceeds available stock.`);
    }

    subtotal += lineTotal;
    totalQty += cart.quantity;

    items.push({
      id: cart.id,
      productId: cart.productId,
      sku: cart.sku,
      name: cart.name,
      brand: cart.brand,
      category: cart.category,
      unitPricePaise: cart.unitPricePaise.toString(),
      quantity: cart.quantity,
      lineTotalPaise: lineTotal.toString(),
      availableQty,
      isAvailable,
      stockWarning,
    });
  }

  return {
    items,
    totalQuantity: totalQty,
    subtotalPaise: subtotal.toString(),
    currency: "INR",
    isCheckoutReady: items.length > 0 && items.every((i) => i.isAvailable),
    warnings,
  };
}

export async function getBuyerCart(sessionId: string): Promise<CartSummary> {
  if (!sessionId) {
    throw new CartError("Session ID is required.", "UNAUTHORIZED", 401);
  }

  return withDb(
    async () => {
      const dbCarts = await prisma.cart.findMany({
        where: { sessionId, status: CartStatus.ACTIVE },
        include: { product: { include: { inventory: true } } },
        orderBy: { createdAt: "asc" },
      });

      if (dbCarts.length === 0) {
        return formatMemoryCart(sessionId);
      }

      const items: CartItemSummary[] = [];
      const warnings: string[] = [];
      let subtotal = 0n;
      let totalQty = 0;

      for (const cart of dbCarts) {
        const prod = cart.product;
        const availableQty = prod.inventory?.availableQty ?? 0;
        const isAvailable = prod.status === ProductStatus.PUBLISHED && availableQty >= cart.quantity;
        const lineTotal = cart.unitPricePaise * BigInt(cart.quantity);

        let stockWarning: string | undefined;
        if (prod.status !== ProductStatus.PUBLISHED) {
          stockWarning = "This product is no longer available.";
          warnings.push(`${prod.name}: no longer available.`);
        } else if (availableQty < cart.quantity) {
          stockWarning = `Only ${availableQty} units available.`;
          warnings.push(`${prod.name}: requested quantity exceeds current stock (${availableQty}).`);
        }

        subtotal += lineTotal;
        totalQty += cart.quantity;

        items.push({
          id: cart.id,
          productId: prod.id,
          sku: prod.sku,
          name: prod.name,
          brand: prod.brand,
          category: prod.category || "audio",
          unitPricePaise: cart.unitPricePaise.toString(),
          quantity: cart.quantity,
          lineTotalPaise: lineTotal.toString(),
          availableQty,
          isAvailable,
          stockWarning,
        });
      }

      return {
        items,
        totalQuantity: totalQty,
        subtotalPaise: subtotal.toString(),
        currency: "INR",
        isCheckoutReady: items.length > 0 && items.every((i) => i.isAvailable),
        warnings,
      };
    },
    () => formatMemoryCart(sessionId)
  );
}

export async function addBuyerCartItem(
  sessionId: string,
  merchantId: string,
  input: AddCartItemInput
): Promise<CartSummary> {
  if (!sessionId) {
    throw new CartError("A valid buyer session is required.", "UNAUTHORIZED", 401);
  }

  const rawQty = input.quantity ?? 1;
  if (!Number.isInteger(rawQty) || rawQty <= 0) {
    throw new CartError("Quantity must be a positive integer.", "INVALID_QUANTITY", 400);
  }

  const product = await getAuthoritativeProduct({
    sku: input.sku,
    productId: input.productId,
    merchantId,
  });

  if (!product) {
    throw new CartError("Product not found.", "PRODUCT_NOT_FOUND", 404);
  }

  if (product.status !== ProductStatus.PUBLISHED) {
    throw new CartError("This product is currently unavailable for purchase.", "PRODUCT_UNAVAILABLE", 400);
  }

  if (product.availableQty < rawQty) {
    throw new CartError(
      `Requested quantity (${rawQty}) exceeds available inventory (${product.availableQty}).`,
      "INSUFFICIENT_STOCK",
      400
    );
  }

  const cartItemId = randomUUID();

  await withDb(
    async () => {
      const existing = await prisma.cart.findFirst({
        where: {
          sessionId,
          productId: product.id,
          status: CartStatus.ACTIVE,
        },
      });

      if (existing) {
        const newQty = existing.quantity + rawQty;
        if (newQty > product.availableQty) {
          throw new CartError(
            `Total cart quantity (${newQty}) exceeds available stock (${product.availableQty}).`,
            "INSUFFICIENT_STOCK",
            400
          );
        }

        await prisma.cart.update({
          where: { id: existing.id },
          data: {
            quantity: newQty,
            unitPricePaise: product.pricePaise,
          },
        });
      } else {
        await prisma.cart.create({
          data: {
            id: cartItemId,
            sessionId,
            productId: product.id,
            quantity: rawQty,
            unitPricePaise: product.pricePaise,
            status: CartStatus.ACTIVE,
          },
        });
      }
    },
    () => {
      const sessionCarts = memoryCartStore.get(sessionId) || [];
      const existingMem = sessionCarts.find(
        (c) => c.sku === product.sku && c.status === CartStatus.ACTIVE
      );

      if (existingMem) {
        const newQty = existingMem.quantity + rawQty;
        if (newQty > product.availableQty) {
          throw new CartError(
            `Total cart quantity (${newQty}) exceeds available stock (${product.availableQty}).`,
            "INSUFFICIENT_STOCK",
            400
          );
        }
        existingMem.quantity = newQty;
        existingMem.unitPricePaise = product.pricePaise;
        existingMem.updatedAt = new Date();
      } else {
        sessionCarts.push({
          id: cartItemId,
          sessionId,
          merchantId,
          productId: product.id,
          sku: product.sku,
          name: product.name,
          brand: product.brand,
          category: product.category,
          unitPricePaise: product.pricePaise,
          quantity: rawQty,
          status: CartStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        memoryCartStore.set(sessionId, sessionCarts);
      }
    }
  );

  // Record audit trail event
  await recordAuditEvent({
    sessionId,
    merchantId,
    actorType: ActorType.CUSTOMER_SESSION,
    action: "CART_ITEM_ADDED",
    entityType: "Cart",
    entityId: cartItemId,
    outcome: "SUCCESS",
    reason: `Added ${rawQty}x of ${product.sku} to cart at ₹${Number(product.pricePaise) / 100}`,
    metadata: {
      sku: product.sku,
      quantity: rawQty,
      unitPricePaise: product.pricePaise.toString(),
    },
  });

  return getBuyerCart(sessionId);
}

export async function updateBuyerCartItem(
  sessionId: string,
  cartItemId: string,
  quantity: number
): Promise<CartSummary> {
  if (!sessionId) {
    throw new CartError("A valid buyer session is required.", "UNAUTHORIZED", 401);
  }

  if (quantity <= 0) {
    return removeBuyerCartItem(sessionId, cartItemId);
  }

  await withDb(
    async () => {
      const item = await prisma.cart.findFirst({
        where: { id: cartItemId, sessionId, status: CartStatus.ACTIVE },
        include: { product: { include: { inventory: true } } },
      });

      if (item) {
        const availableQty = item.product.inventory?.availableQty ?? 0;
        if (quantity > availableQty) {
          throw new CartError(
            `Requested quantity (${quantity}) exceeds available stock (${availableQty}).`,
            "INSUFFICIENT_STOCK",
            400
          );
        }

        await prisma.cart.update({
          where: { id: item.id },
          data: { quantity },
        });
      } else {
        throw new CartError("Cart item not found.", "NOT_FOUND", 404);
      }
    },
    () => {
      const sessionCarts = memoryCartStore.get(sessionId) || [];
      const target = sessionCarts.find(
        (c) => c.id === cartItemId && c.status === CartStatus.ACTIVE
      );
      if (!target) {
        throw new CartError("Cart item not found.", "NOT_FOUND", 404);
      }

      const demoProd = getDemoProductBySkuOrId(target.sku);
      const availableQty = demoProd?.availableQty ?? 10;
      if (quantity > availableQty) {
        throw new CartError(
          `Requested quantity (${quantity}) exceeds available stock (${availableQty}).`,
          "INSUFFICIENT_STOCK",
          400
        );
      }

      target.quantity = quantity;
      target.updatedAt = new Date();
    }
  );

  await recordAuditEvent({
    sessionId,
    actorType: ActorType.CUSTOMER_SESSION,
    action: "CART_QUANTITY_UPDATED",
    entityType: "Cart",
    entityId: cartItemId,
    outcome: "SUCCESS",
    reason: `Updated quantity to ${quantity}`,
    metadata: { cartItemId, newQuantity: quantity },
  });

  return getBuyerCart(sessionId);
}

export async function removeBuyerCartItem(
  sessionId: string,
  cartItemId: string
): Promise<CartSummary> {
  if (!sessionId) {
    throw new CartError("A valid buyer session is required.", "UNAUTHORIZED", 401);
  }

  await withDb(
    async () => {
      await prisma.cart.deleteMany({
        where: { id: cartItemId, sessionId },
      });
    },
    () => {
      const sessionCarts = memoryCartStore.get(sessionId) || [];
      const nextCarts = sessionCarts.filter((c) => c.id !== cartItemId);
      memoryCartStore.set(sessionId, nextCarts);
    }
  );

  await recordAuditEvent({
    sessionId,
    actorType: ActorType.CUSTOMER_SESSION,
    action: "CART_ITEM_REMOVED",
    entityType: "Cart",
    entityId: cartItemId,
    outcome: "SUCCESS",
    reason: `Removed cart item ${cartItemId}`,
    metadata: { cartItemId },
  });

  return getBuyerCart(sessionId);
}

export async function clearBuyerCart(sessionId: string): Promise<CartSummary> {
  if (!sessionId) {
    throw new CartError("A valid buyer session is required.", "UNAUTHORIZED", 401);
  }

  await withDb(
    async () => {
      await prisma.cart.deleteMany({
        where: { sessionId, status: CartStatus.ACTIVE },
      });
    },
    () => {
      memoryCartStore.set(sessionId, []);
    }
  );

  await recordAuditEvent({
    sessionId,
    actorType: ActorType.CUSTOMER_SESSION,
    action: "CART_CLEARED",
    entityType: "Cart",
    entityId: sessionId,
    outcome: "SUCCESS",
    reason: `Cleared all active cart items for session ${sessionId}`,
    metadata: { sessionId },
  });

  return getBuyerCart(sessionId);
}
