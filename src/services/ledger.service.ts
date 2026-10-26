import { Database as DatabaseType } from "better-sqlite3";
import { getDatabase } from "../config/database.js";
import {
  AccountRecord,
  TransactionRecord,
  AccountResponse,
  TransactionResponse,
  BalanceResponse,
  TransactionHistoryResponse,
  AuditReport,
  TransactionType
} from "../types/ledger.js";
import { centsToDecimal, decimalToCents } from "../utils/currency.js";
import { generateAccountId, generateTransactionId } from "../utils/id.js";

export class LedgerError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = "LedgerError";
  }
}

export class AccountNotFoundError extends LedgerError {
  constructor(accountId: string) {
    super(404, "ACCOUNT_NOT_FOUND", `Account with ID '${accountId}' does not exist.`, {
      account_id: accountId
    });
    this.name = "AccountNotFoundError";
  }
}

export class DuplicateTransactionError extends LedgerError {
  constructor(accountId: string, referenceId: string) {
    super(
      409,
      "DUPLICATE_TRANSACTION",
      `A transaction with reference_id '${referenceId}' already exists for account '${accountId}'.`,
      { account_id: accountId, reference_id: referenceId }
    );
    this.name = "DuplicateTransactionError";
  }
}

export class InsufficientFundsError extends LedgerError {
  constructor(currentBalance: number, requestedAmount: number) {
    super(
      400,
      "INSUFFICIENT_FUNDS",
      `Debit transaction rejected: Insufficient balance. Current balance is ${currentBalance.toFixed(2)}, requested debit is ${requestedAmount.toFixed(2)}.`,
      {
        current_balance: currentBalance,
        requested_amount: requestedAmount
      }
    );
    this.name = "InsufficientFundsError";
  }
}

export class LedgerService {
  private db: DatabaseType;

  constructor(customDb?: DatabaseType) {
    this.db = customDb || getDatabase();
  }

  /**
   * 1. Create a new account
   * Initial balance is always 0. Client is strictly prohibited from setting balance.
   */
  public createAccount(name: string): AccountResponse {
    const id = generateAccountId();
    const createdAt = new Date().toISOString();
    const initialBalanceCents = 0;

    const stmt = this.db.prepare(`
      INSERT INTO accounts (id, name, balance_cents, created_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, name, initialBalanceCents, createdAt);

    return {
      id,
      name,
      balance: 0.0,
      created_at: createdAt
    };
  }

  /**
   * Helper to retrieve raw account record
   */
  public getAccount(accountId: string): AccountRecord {
    const stmt = this.db.prepare<[string], AccountRecord>(`
      SELECT id, name, balance_cents, created_at
      FROM accounts
      WHERE id = ?
    `);

    const account = stmt.get(accountId);
    if (!account) {
      throw new AccountNotFoundError(accountId);
    }

    return account;
  }

  /**
   * List all accounts (useful for playground and administration)
   */
  public listAccounts(): AccountResponse[] {
    const stmt = this.db.prepare<[], AccountRecord>(`
      SELECT id, name, balance_cents, created_at
      FROM accounts
      ORDER BY created_at DESC
    `);

    const accounts = stmt.all();
    return accounts.map((acc) => ({
      id: acc.id,
      name: acc.name,
      balance: centsToDecimal(acc.balance_cents),
      created_at: acc.created_at
    }));
  }

  /**
   * 3. Get Account Balance
   */
  public getAccountBalance(accountId: string): BalanceResponse {
    const account = this.getAccount(accountId);
    return {
      account_id: account.id,
      balance: centsToDecimal(account.balance_cents),
      name: account.name,
      created_at: account.created_at
    };
  }

  /**
   * 2. Add Transaction (Atomic credit / debit with duplicate & overdraft protection)
   */
  public addTransaction(params: {
    account_id: string;
    type: TransactionType;
    amount: number;
    description: string;
    reference_id: string;
  }): TransactionResponse {
    const { account_id, type, amount, description, reference_id } = params;
    const amountCents = decimalToCents(amount);
    const txnId = generateTransactionId();
    const createdAt = new Date().toISOString();

    // Execute within a strict ACID transaction with BEGIN IMMEDIATE
    const executeTx = this.db.transaction(() => {
      // 1. Verify account exists
      const accountStmt = this.db.prepare<[string], AccountRecord>(`
        SELECT id, name, balance_cents, created_at
        FROM accounts
        WHERE id = ?
      `);
      const account = accountStmt.get(account_id);
      if (!account) {
        throw new AccountNotFoundError(account_id);
      }

      // 2. Check for duplicate reference_id within this account
      const dupStmt = this.db.prepare<[string, string], { id: string }>(`
        SELECT id FROM transactions
        WHERE account_id = ? AND reference_id = ?
      `);
      const existingTx = dupStmt.get(account_id, reference_id);
      if (existingTx) {
        throw new DuplicateTransactionError(account_id, reference_id);
      }

      // 3. Check debit balance sufficiency
      if (type === "debit") {
        if (account.balance_cents < amountCents) {
          throw new InsufficientFundsError(
            centsToDecimal(account.balance_cents),
            amount
          );
        }
      }

      // 4. Calculate new balance
      const newBalanceCents =
        type === "credit"
          ? account.balance_cents + amountCents
          : account.balance_cents - amountCents;

      // 5. Insert immutable transaction record
      const insertTxStmt = this.db.prepare(`
        INSERT INTO transactions (id, account_id, type, amount_cents, description, reference_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertTxStmt.run(
        txnId,
        account_id,
        type,
        amountCents,
        description,
        reference_id,
        createdAt
      );

      // 6. Update account balance atomically
      const updateBalStmt = this.db.prepare(`
        UPDATE accounts
        SET balance_cents = ?
        WHERE id = ?
      `);
      updateBalStmt.run(newBalanceCents, account_id);

      return {
        id: txnId,
        account_id,
        type,
        amount: centsToDecimal(amountCents),
        description,
        reference_id,
        created_at: createdAt,
        resulting_balance: centsToDecimal(newBalanceCents)
      };
    });

    return executeTx();
  }

  /**
   * 4. Get Transaction History
   * Supports filtering by type, pagination (page, limit), and latest-first sorting
   */
  public getTransactionHistory(params: {
    account_id: string;
    type?: TransactionType;
    page: number;
    limit: number;
  }): TransactionHistoryResponse {
    const { account_id, type, page, limit } = params;

    // Validate account exists
    this.getAccount(account_id);

    const offset = (page - 1) * limit;

    // Build count and select queries
    let countSql = `SELECT COUNT(*) as total FROM transactions WHERE account_id = ?`;
    let selectSql = `
      SELECT id, account_id, type, amount_cents, description, reference_id, created_at
      FROM transactions
      WHERE account_id = ?
    `;

    const queryParams: any[] = [account_id];

    if (type) {
      countSql += ` AND type = ?`;
      selectSql += ` AND type = ?`;
      queryParams.push(type);
    }

    selectSql += ` ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;

    const countStmt = this.db.prepare(countSql);
    const countResult = (countStmt.get(...queryParams) as { total: number }) || { total: 0 };
    const totalRecords = countResult.total;
    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / limit) : 0;

    const selectStmt = this.db.prepare<any[], TransactionRecord>(selectSql);
    const records = selectStmt.all(...queryParams, limit, offset);

    const transactions: TransactionResponse[] = records.map((tx) => ({
      id: tx.id,
      account_id: tx.account_id,
      type: tx.type,
      amount: centsToDecimal(tx.amount_cents),
      description: tx.description,
      reference_id: tx.reference_id,
      created_at: tx.created_at
    }));

    return {
      account_id,
      pagination: {
        current_page: page,
        page_size: limit,
        total_records: totalRecords,
        total_pages: totalPages
      },
      transactions
    };
  }

  /**
   * 5. Data Integrity: Audit Reconciliation
   * Recalculates balance from all historical transactions and compares to account.balance
   */
  public auditAccount(accountId: string): AuditReport {
    const account = this.getAccount(accountId);

    const auditStmt = this.db.prepare<[string], {
      tx_count: number;
      total_credits: number;
      total_debits: number;
    }>(`
      SELECT 
        COUNT(*) as tx_count,
        COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents ELSE 0 END), 0) as total_credits,
        COALESCE(SUM(CASE WHEN type = 'debit' THEN amount_cents ELSE 0 END), 0) as total_debits
      FROM transactions
      WHERE account_id = ?
    `);

    const result = auditStmt.get(accountId)!;
    const calculatedBalanceCents = result.total_credits - result.total_debits;
    const isConsistent = calculatedBalanceCents === account.balance_cents;

    return {
      account_id: account.id,
      account_name: account.name,
      current_balance: centsToDecimal(account.balance_cents),
      calculated_balance: centsToDecimal(calculatedBalanceCents),
      total_credits: centsToDecimal(result.total_credits),
      total_debits: centsToDecimal(result.total_debits),
      transaction_count: result.tx_count,
      is_consistent: isConsistent,
      audited_at: new Date().toISOString()
    };
  }
}
