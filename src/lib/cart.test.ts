import test from "node:test";
import assert from "node:assert/strict";
import {
  addBuyerCartItem,
  getBuyerCart,
  updateBuyerCartItem,
  removeBuyerCartItem,
  clearBuyerCart,
} from "./cart.server";
import { getMemoryAuditEvents } from "./audit.server";

const TEST_SESSION_ID = "test-session-cart-123";
const TEST_MERCHANT_ID = "merchant-demo-001";

test("Cart: rejects without session ID", async () => {
  await assert.rejects(
    async () => {
      await getBuyerCart("");
    },
    { name: "CartError", code: "UNAUTHORIZED" }
  );
});

test("Cart: adds valid product with authoritative price and stock", async () => {
  await clearBuyerCart(TEST_SESSION_ID);

  const cart = await addBuyerCartItem(TEST_SESSION_ID, TEST_MERCHANT_ID, {
    sku: "SN-SPK-PRO",
    quantity: 1,
  });

  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].sku, "SN-SPK-PRO");
  assert.equal(cart.items[0].unitPricePaise, "399900"); // ₹3,999 authoritative
  assert.equal(cart.items[0].quantity, 1);
  assert.equal(cart.subtotalPaise, "399900");
  assert.equal(cart.isCheckoutReady, true);
});

test("Cart: rejects nonexistent product with 404", async () => {
  await assert.rejects(
    async () => {
      await addBuyerCartItem(TEST_SESSION_ID, TEST_MERCHANT_ID, {
        sku: "NON-EXISTENT-SKU",
        quantity: 1,
      });
    },
    { name: "CartError", code: "PRODUCT_NOT_FOUND" }
  );
});

test("Cart: rejects invalid quantities (0, negative)", async () => {
  await assert.rejects(
    async () => {
      await addBuyerCartItem(TEST_SESSION_ID, TEST_MERCHANT_ID, {
        sku: "SN-BUDS-PRO",
        quantity: 0,
      });
    },
    { name: "CartError", code: "INVALID_QUANTITY" }
  );

  await assert.rejects(
    async () => {
      await addBuyerCartItem(TEST_SESSION_ID, TEST_MERCHANT_ID, {
        sku: "SN-BUDS-PRO",
        quantity: -2,
      });
    },
    { name: "CartError", code: "INVALID_QUANTITY" }
  );
});

test("Cart: rejects quantity exceeding available inventory", async () => {
  await assert.rejects(
    async () => {
      await addBuyerCartItem(TEST_SESSION_ID, TEST_MERCHANT_ID, {
        sku: "SN-BUDS-PRO",
        quantity: 99999,
      });
    },
    { name: "CartError", code: "INSUFFICIENT_STOCK" }
  );
});

test("Cart: merges quantity when adding same product again", async () => {
  await clearBuyerCart(TEST_SESSION_ID);

  await addBuyerCartItem(TEST_SESSION_ID, TEST_MERCHANT_ID, {
    sku: "SN-BUDS-LITE",
    quantity: 1,
  });

  const updatedCart = await addBuyerCartItem(TEST_SESSION_ID, TEST_MERCHANT_ID, {
    sku: "SN-BUDS-LITE",
    quantity: 2,
  });

  assert.equal(updatedCart.items.length, 1);
  assert.equal(updatedCart.items[0].sku, "SN-BUDS-LITE");
  assert.equal(updatedCart.items[0].quantity, 3);
  assert.equal(updatedCart.totalQuantity, 3);
  // ₹1,499 * 3 = ₹4,497
  assert.equal(updatedCart.subtotalPaise, "449700");
});

test("Cart: updates item quantity and recalculates totals", async () => {
  await clearBuyerCart(TEST_SESSION_ID);

  const initial = await addBuyerCartItem(TEST_SESSION_ID, TEST_MERCHANT_ID, {
    sku: "SN-HP-BASSWAVE",
    quantity: 1,
  });

  const cartItemId = initial.items[0].id;
  const updated = await updateBuyerCartItem(TEST_SESSION_ID, cartItemId, 4);

  assert.equal(updated.items[0].quantity, 4);
  // ₹1,999 * 4 = ₹7,996
  assert.equal(updated.subtotalPaise, "799600");
});

test("Cart: removing an item or setting quantity to 0 removes it", async () => {
  await clearBuyerCart(TEST_SESSION_ID);

  await addBuyerCartItem(TEST_SESSION_ID, TEST_MERCHANT_ID, {
    sku: "SN-BUDS-LITE",
    quantity: 1,
  });
  const cartWithBoth = await addBuyerCartItem(TEST_SESSION_ID, TEST_MERCHANT_ID, {
    sku: "SN-SPK-PRO",
    quantity: 1,
  });

  assert.equal(cartWithBoth.items.length, 2);

  const itemToRemove = cartWithBoth.items[0].id;
  const afterRemove = await removeBuyerCartItem(TEST_SESSION_ID, itemToRemove);

  assert.equal(afterRemove.items.length, 1);
  assert.equal(afterRemove.items[0].sku, "SN-SPK-PRO");

  // Setting quantity 0 removes remaining
  const lastItem = afterRemove.items[0].id;
  const afterZero = await updateBuyerCartItem(TEST_SESSION_ID, lastItem, 0);
  assert.equal(afterZero.items.length, 0);
  assert.equal(afterZero.subtotalPaise, "0");
});

test("Cart: audit events are emitted on cart operations", async () => {
  const auditEvents = getMemoryAuditEvents({ sessionId: TEST_SESSION_ID });
  assert.ok(auditEvents.length > 0);
  assert.ok(auditEvents.some((e) => e.action === "CART_ITEM_ADDED"));
});
