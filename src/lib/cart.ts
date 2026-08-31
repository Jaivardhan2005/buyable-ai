export type CartItemSummary = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  unitPricePaise: string;
  quantity: number;
  lineTotalPaise: string;
  availableQty: number;
  isAvailable: boolean;
  stockWarning?: string;
};

export type CartSummary = {
  items: CartItemSummary[];
  totalQuantity: number;
  subtotalPaise: string;
  currency: "INR";
  isCheckoutReady: boolean;
  warnings: string[];
};

export type AddCartItemInput = {
  sku?: string;
  productId?: string;
  quantity?: number;
};

export type UpdateCartItemInput = {
  cartItemId: string;
  quantity: number;
};

export class CartError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string = "CART_ERROR", status: number = 400) {
    super(message);
    this.name = "CartError";
    this.code = code;
    this.status = status;
  }
}
