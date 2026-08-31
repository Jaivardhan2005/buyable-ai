import { NextResponse } from "next/server";
import { getBuyerSessionFromCookie } from "@/lib/session.server";
import {
  getBuyerCart,
  addBuyerCartItem,
  updateBuyerCartItem,
  removeBuyerCartItem,
  clearBuyerCart,
} from "@/lib/cart.server";
import { CartError } from "@/lib/cart";

export async function GET() {
  const session = await getBuyerSessionFromCookie();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "A valid buyer session is required." } },
      { status: 401 }
    );
  }

  try {
    const cart = await getBuyerCart(session.id);
    return NextResponse.json(cart, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof CartError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to retrieve cart." } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getBuyerSessionFromCookie();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "A valid buyer session is required." } },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON." } },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;
  const sku = typeof payload?.sku === "string" ? payload.sku.trim() : undefined;
  const productId = typeof payload?.productId === "string" ? payload.productId.trim() : undefined;
  const quantity = typeof payload?.quantity === "number" ? payload.quantity : 1;

  if (!sku && !productId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Either sku or productId is required." } },
      { status: 400 }
    );
  }

  try {
    const cart = await addBuyerCartItem(session.id, session.merchantId, {
      sku,
      productId,
      quantity,
    });
    return NextResponse.json(cart, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof CartError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to add item to cart." } }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getBuyerSessionFromCookie();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "A valid buyer session is required." } },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON." } },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;
  const cartItemId = typeof payload?.cartItemId === "string" ? payload.cartItemId.trim() : "";
  const quantity = typeof payload?.quantity === "number" ? payload.quantity : 0;

  if (!cartItemId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "cartItemId is required." } },
      { status: 400 }
    );
  }

  try {
    const cart = await updateBuyerCartItem(session.id, cartItemId, quantity);
    return NextResponse.json(cart, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof CartError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to update cart." } }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getBuyerSessionFromCookie();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "A valid buyer session is required." } },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  let cartItemId = searchParams.get("cartItemId")?.trim();

  if (!cartItemId) {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      if (typeof body?.cartItemId === "string") {
        cartItemId = body.cartItemId.trim();
      }
    } catch {
      // Body is optional for DELETE
    }
  }

  try {
    if (cartItemId) {
      const cart = await removeBuyerCartItem(session.id, cartItemId);
      return NextResponse.json(cart, { status: 200 });
    } else {
      const cart = await clearBuyerCart(session.id);
      return NextResponse.json(cart, { status: 200 });
    }
  } catch (err: unknown) {
    if (err instanceof CartError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to modify cart." } }, { status: 500 });
  }
}
