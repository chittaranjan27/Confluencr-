# Transaction Ledger API System

> A production-grade, ACID-compliant Transaction Ledger API built with **Node.js**, **TypeScript**, **Express**, and **SQLite (WAL mode)**. Features mathematical balance consistency, strict deduplication via reference IDs, immutable audit logging, comprehensive automated tests, interactive Swagger documentation, and a full-stack dashboard playground.

---

## 📋 Table of Contents
- [Architecture & Design Decisions](#architecture--design-decisions)
- [System Requirements & Guarantees](#system-requirements--guarantees)
- [Quick Start Guide](#quick-start-guide)
- [API Reference](#api-reference)
  - [1. Create Account](#1-create-account)
  - [2. Add Transaction](#2-add-transaction)
  - [3. Get Account Balance](#3-get-account-balance)
  - [4. Get Transaction History](#4-get-transaction-history)
  - [5. Ledger Audit Reconciliation](#5-ledger-audit-reconciliation)
- [Interactive Dashboard & Swagger Docs](#interactive-dashboard--swagger-docs)
- [Automated Test Suite](#automated-test-suite)

---

## 🏛 Architecture & Design Decisions

### 1. Zero Floating-Point Drift (Integer Cents Precision)
Monetary calculations in standard IEEE 754 floating-point math can introduce subtle errors (e.g., `0.1 + 0.2 = 0.30000000000000004`). In this system:
- All balances and amounts are stored and computed internally as **integer cents** (`balance_cents`, `amount_cents`).
- All incoming amounts are converted to exact cents using round-to-nearest integer.
- The API responses format amounts into standard 2-decimal numbers (`100.50`).

### 2. ACID Transactions & Concurrency Safety
- Transactions are executed inside SQLite transactions with `BEGIN IMMEDIATE` locks.
- Even under intense concurrent load (e.g., simultaneous debits), double-spending is impossible.
- A database-level `CHECK (balance_cents >= 0)` constraint guarantees that an account balance can never drop below zero.

### 3. Duplicate Transaction Prevention
- Composite unique constraint: `UNIQUE (account_id, reference_id)`.
- Re-submitting a transaction with the same `reference_id` for the same account is immediately caught and rejected with **409 Conflict**.
- The same `reference_id` **is** permissible across different accounts.

### 4. Strict Immutability
- Once written, transaction records can **never** be edited or deleted.
- Database triggers (`BEFORE UPDATE` and `BEFORE DELETE`) abort any raw SQL mutations.
- The HTTP router rejects `PUT`, `PATCH`, and `DELETE` requests with **405 Method Not Allowed**.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js** (v18+ or v22 recommended)
- **npm** (v9+)

### Installation
```bash
git clone <repository_url>
cd Confluenc
npm install
```

### Run Locally (Dev Mode)
```bash
npm run dev
```
Server starts at **`http://localhost:3000`**:
- **Interactive UI Playground**: `http://localhost:3000/`
- **Swagger / OpenAPI Documentation**: `http://localhost:3000/docs`
- **Health Check**: `http://localhost:3000/health`

### Run Automated Tests
```bash
npm test
```
Runs 23 automated tests across 4 test suites with 100% pass rate.

---

## 📖 API Reference

### 1. Create Account
**Endpoint**: `POST /api/accounts`

Creates a new ledger account. Initial balance is strictly initialized to `0.00`.

**Request**:
```bash
curl -X POST http://localhost:3000/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice Cooper"}'
```

**Response (`201 Created`)**:
```json
{
  "id": "acc_a8e234c9f1...",
  "name": "Alice Cooper",
  "balance": 0.00,
  "created_at": "2026-10-26T12:00:00.000Z"
}
```

*Note: If client attempts to pass a `balance`, the request is rejected with `400 Bad Request`.*

---

### 2. Add Transaction
**Endpoint**: `POST /api/accounts/:accountId/transactions`
*(or top-level `POST /api/transactions` with `account_id` in body)*

#### Credit Transaction
Increases account balance.

```bash
curl -X POST http://localhost:3000/api/accounts/acc_xxx/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "credit",
    "amount": 100.00,
    "description": "Salary deposit",
    "reference_id": "REF-PAYROLL-001"
  }'
```

**Response (`201 Created`)**:
```json
{
  "id": "txn_8b417c80...",
  "account_id": "acc_xxx",
  "type": "credit",
  "amount": 100.00,
  "description": "Salary deposit",
  "reference_id": "REF-PAYROLL-001",
  "created_at": "2026-10-26T12:05:00.000Z",
  "resulting_balance": 100.00
}
```

#### Debit Transaction
Decreases account balance.

```bash
curl -X POST http://localhost:3000/api/accounts/acc_xxx/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "debit",
    "amount": 30.00,
    "description": "Groceries",
    "reference_id": "REF-GROC-001"
  }'
```

**Response (`201 Created`)**:
```json
{
  "id": "txn_9f27...",
  "account_id": "acc_xxx",
  "type": "debit",
  "amount": 30.00,
  "description": "Groceries",
  "reference_id": "REF-GROC-001",
  "created_at": "2026-10-26T12:06:00.000Z",
  "resulting_balance": 70.00
}
```

#### Overdraft Protection (Insufficient Balance)
If a debit exceeds current balance:
**Response (`400 Bad Request`)**:
```json
{
  "error": "INSUFFICIENT_FUNDS",
  "message": "Debit transaction rejected: Insufficient balance. Current balance is 70.00, requested debit is 150.00.",
  "current_balance": 70.00,
  "requested_amount": 150.00
}
```
*Balance remains unchanged and no transaction is created.*

#### Duplicate Reference Rejection
If a transaction with the same `reference_id` is submitted again for the same account:
**Response (`409 Conflict`)**:
```json
{
  "error": "DUPLICATE_TRANSACTION",
  "message": "A transaction with reference_id 'REF-PAYROLL-001' already exists for account 'acc_xxx'.",
  "account_id": "acc_xxx",
  "reference_id": "REF-PAYROLL-001"
}
```
*Balance remains unchanged and no transaction is created.*

---

### 3. Get Account Balance
**Endpoint**: `GET /api/accounts/:accountId/balance`

```bash
curl -X GET http://localhost:3000/api/accounts/acc_xxx/balance
```

**Response (`200 OK`)**:
```json
{
  "account_id": "acc_xxx",
  "balance": 70.00,
  "name": "Alice Cooper",
  "created_at": "2026-10-26T12:00:00.000Z"
}
```

---

### 4. Get Transaction History
**Endpoint**: `GET /api/accounts/:accountId/transactions`

**Query Parameters**:
- `type`: Optional (`credit` | `debit`). If omitted, returns both.
- `page`: Optional integer $\ge 1$ (default: `1`).
- `limit`: Optional integer $1 \dots 100$ (default: `10`).

**Sorting**: Strictly ordered **latest-first** (`created_at DESC, id DESC`).

```bash
curl -X GET "http://localhost:3000/api/accounts/acc_xxx/transactions?type=credit&page=1&limit=5"
```

**Response (`200 OK`)**:
```json
{
  "account_id": "acc_xxx",
  "pagination": {
    "current_page": 1,
    "page_size": 5,
    "total_records": 12,
    "total_pages": 3
  },
  "transactions": [
    {
      "id": "txn_8b417c80...",
      "account_id": "acc_xxx",
      "type": "credit",
      "amount": 100.00,
      "description": "Salary deposit",
      "reference_id": "REF-PAYROLL-001",
      "created_at": "2026-10-26T12:05:00.000Z"
    }
  ]
}
```

---

### 5. Ledger Audit Reconciliation
**Endpoint**: `GET /api/accounts/:accountId/audit`

Calculates $\sum \text{Credits} - \sum \text{Debits}$ from all historical transactions and compares it with the account's current stored balance to prove 100% mathematical integrity.

```bash
curl -X GET http://localhost:3000/api/accounts/acc_xxx/audit
```

**Response (`200 OK`)**:
```json
{
  "account_id": "acc_xxx",
  "account_name": "Alice Cooper",
  "current_balance": 70.00,
  "calculated_balance": 70.00,
  "total_credits": 100.00,
  "total_debits": 30.00,
  "transaction_count": 2,
  "is_consistent": true,
  "audited_at": "2026-10-26T12:10:00.000Z"
}
```

---

## 🧪 Automated Test Suite

Run the full automated test suite with:
```bash
npm test
```

### Coverage Overview:
- `tests/accounts.test.ts`:
  - Account creation with unique ID and system timestamps.
  - Initial balance locked to 0.00 (rejecting client overrides).
  - Validation of required name.
  - Balance retrieval & 404 handling.
- `tests/transactions.test.ts`:
  - Credit transactions and balance accumulation.
  - Debit transactions and balance deductions.
  - Overdraft rejection and zero balance drift.
  - Reference ID deduplication per account (409 Conflict).
  - Allowing duplicate reference IDs across separate accounts.
  - Input validation (positive amounts, non-empty descriptions).
- `tests/history.test.ts`:
  - Filtering by type (`credit`, `debit`, all).
  - Pagination with page size, total pages, and total records.
  - Latest-first sorting (`created_at DESC`).
- `tests/concurrency_integrity.test.ts`:
  - Transaction immutability (HTTP 405 for PUT/PATCH/DELETE).
  - SQLite database triggers preventing raw SQL mutations.
  - Balance consistency verification following the assignment specification example.
  - Concurrency stress test: 10 parallel debits with zero race conditions and zero negative balances.

---

## 🎨 Interactive Dashboard & Swagger Docs

When the server is running, navigate to:
- **`http://localhost:3000`**: A glassmorphic web dashboard allowing you to:
  - Create accounts.
  - Switch between active accounts.
  - Perform live credits and debits.
  - Run preset scenarios (*Trigger Overdraft Rejection*, *Trigger Duplicate Reference*).
  - Filter and paginate the live transaction ledger.
  - Run the real-time Ledger Balance Audit.
- **`http://localhost:3000/docs`**: Interactive Swagger UI to inspect and test all API routes directly.
