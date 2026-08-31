import { TransactionStatus } from "../../generated/prisma";

export type CreatePaymentOrderInput = {
  transactionId: string;
};

export type RazorpayOrderSnapshot = {
  keyId: string;
  razorpayOrderId: string;
  amountPaise: string;
  currency: "INR";
  transactionId: string;
  merchantName?: string;
  description?: string;
};

export type VerifyPaymentInput = {
  transactionId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};

export type PaymentVerificationResult = {
  verified: boolean;
  transactionId: string;
  status: TransactionStatus;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amountPaise: string;
  currency: "INR";
  confirmedAt: string;
};

export class PaymentError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string = "PAYMENT_ERROR", status: number = 400) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
    this.status = status;
  }
}
