import { TransactionStatus } from "../../generated/prisma";

export type OrderItemSnapshot = {
  productId: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  quantity: number;
  unitPricePaise: string;
  lineTotalPaise: string;
};

export type VerifiedPolicySnapshot = {
  policyType: string;
  title: string;
  summary: string;
  status: "ACTIVE" | "VERIFIED";
};

export type OrderSnapshot = {
  orderId: string;
  transactionId: string;
  merchantId: string;
  sessionId: string;
  status: TransactionStatus;
  amountPaise: string;
  currency: "INR";
  idempotencyKey: string;
  items: OrderItemSnapshot[];
  policies: VerifiedPolicySnapshot[];
  createdAt: string;
};

export type CreateOrderInput = {
  idempotencyKey?: string;
};

export class OrderError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string = "ORDER_ERROR", status: number = 400) {
    super(message);
    this.name = "OrderError";
    this.code = code;
    this.status = status;
  }
}
