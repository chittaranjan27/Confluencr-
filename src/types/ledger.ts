export type TransactionType = "credit" | "debit";

export interface AccountRecord {
  id: string;
  name: string;
  balance_cents: number;
  created_at: string;
}

export interface TransactionRecord {
  id: string;
  account_id: string;
  type: TransactionType;
  amount_cents: number;
  description: string;
  reference_id: string;
  created_at: string;
}

export interface AccountResponse {
  id: string;
  name: string;
  balance: number;
  created_at: string;
}

export interface TransactionResponse {
  id: string;
  account_id: string;
  type: TransactionType;
  amount: number;
  description: string;
  reference_id: string;
  created_at: string;
  resulting_balance?: number;
}

export interface BalanceResponse {
  account_id: string;
  balance: number;
  name?: string;
  created_at?: string;
}

export interface PaginationMeta {
  current_page: number;
  page_size: number;
  total_records: number;
  total_pages: number;
}

export interface TransactionHistoryResponse {
  account_id: string;
  pagination: PaginationMeta;
  transactions: TransactionResponse[];
}

export interface AuditReport {
  account_id: string;
  account_name: string;
  current_balance: number;
  calculated_balance: number;
  total_credits: number;
  total_debits: number;
  transaction_count: number;
  is_consistent: boolean;
  audited_at: string;
}
