import Database, { Database as DatabaseType } from "better-sqlite3";
import path from "path";
import fs from "fs";

let dbInstance: DatabaseType | null = null;

export function initDatabase(dbPath?: string): DatabaseType {
  const resolvedPath = dbPath || process.env.DB_FILE || path.resolve(process.cwd(), "ledger.sqlite");
  
  if (resolvedPath !== ":memory:") {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(resolvedPath);

  // Configure SQLite for high reliability & concurrency
  db.pragma("foreign_keys = ON");
  if (resolvedPath !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  db.pragma("synchronous = NORMAL");

  // Schema initialization
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      description TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      CONSTRAINT uq_account_reference UNIQUE (account_id, reference_id)
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_account_created 
      ON transactions(account_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_account_type 
      ON transactions(account_id, type);

    CREATE INDEX IF NOT EXISTS idx_transactions_ref 
      ON transactions(account_id, reference_id);

    -- Immutability Triggers: Ensure transactions can NEVER be edited or deleted
    CREATE TRIGGER IF NOT EXISTS trg_transactions_no_update
      BEFORE UPDATE ON transactions
      BEGIN
        SELECT RAISE(ABORT, 'Transaction records are strictly immutable and cannot be modified');
      END;

    CREATE TRIGGER IF NOT EXISTS trg_transactions_no_delete
      BEFORE DELETE ON transactions
      BEGIN
        SELECT RAISE(ABORT, 'Transaction records are strictly immutable and cannot be deleted');
      END;
  `);

  dbInstance = db;
  return db;
}

export function getDatabase(): DatabaseType {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
