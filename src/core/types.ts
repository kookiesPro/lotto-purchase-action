export interface BalanceFeedbackMetadata {
  remainingBalance?: number;
  balanceCheckedAt?: string;
  balanceCheckError?: string;
}

export interface LottoPurchaseMetadata extends BalanceFeedbackMetadata {
  product: 'lotto645';
  type: 'auto' | 'manual';
  numbers: number[][];
  timestamp: string;
}

export interface Pension720Ticket {
  group: string;
  number: string;
  raw?: string;
}

export interface Pension720PurchaseResult {
  product: 'pension720';
  type: 'auto';
  round?: string;
  orderNo?: string;
  orderDate?: string;
  amount: number;
  ticketCount: number;
  tickets: Pension720Ticket[];
  failedTicketCount?: number;
  failedTickets?: Pension720Ticket[];
  message?: string;
}

export interface Pension720PurchaseMetadata extends BalanceFeedbackMetadata, Pension720PurchaseResult {
  timestamp: string;
}

export type PurchaseMetadata = LottoPurchaseMetadata | Pension720PurchaseMetadata;
