import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { initDatabase, closeDatabase } from "../src/config/database.js";
import { LedgerService } from "../src/services/ledger.service.js";

describe("Transaction APIs (Requirement 2 & 5)", () => {
  let app: any;
  let accountId: string;

  beforeEach(async () => {
    const db = initDatabase(":memory:");
    const service = new LedgerService(db);
    app = createApp(service);

    const accRes = await request(app).post("/api/accounts").send({ name: "Alice Ledger" });
    accountId = accRes.body.id;
  });

  afterEach(() => {
    closeDatabase();
  });

  describe("Credit Transactions", () => {
    it("should increase the account balance by the transaction amount", async () => {
      // 1. Initial credit 100
      const tx1 = await request(app)
        .post(`/api/accounts/${accountId}/transactions`)
        .send({
          type: "credit",
          amount: 100.0,
          description: "Initial payroll",
          reference_id: "REF-001"
        });

      expect(tx1.status).toBe(201);
      expect(tx1.body.type).toBe("credit");
      expect(tx1.body.amount).toBe(100.0);
      expect(tx1.body.resulting_balance).toBe(100.0);
      expect(tx1.body.reference_id).toBe("REF-001");

      // Verify balance endpoint
      const bal1 = await request(app).get(`/api/accounts/${accountId}/balance`);
      expect(bal1.body.balance).toBe(100.0);

      // 2. Second credit 50 -> 150
      const tx2 = await request(app)
        .post(`/api/accounts/${accountId}/transactions`)
        .send({
          type: "credit",
          amount: 50.0,
          description: "Bonus payout",
          reference_id: "REF-002"
        });

      expect(tx2.status).toBe(201);
      expect(tx2.body.resulting_balance).toBe(150.0);

      const bal2 = await request(app).get(`/api/accounts/${accountId}/balance`);
      expect(bal2.body.balance).toBe(150.0);
    });
  });

  describe("Debit Transactions", () => {
    it("should decrease the account balance by the transaction amount when sufficient balance exists", async () => {
      // Setup balance of 100
      await request(app)
        .post(`/api/accounts/${accountId}/transactions`)
        .send({
          type: "credit",
          amount: 100.0,
          description: "Deposit",
          reference_id: "REF-INIT"
        });

      // Debit 30 -> New balance: 70
      const debitRes = await request(app)
        .post(`/api/accounts/${accountId}/transactions`)
        .send({
          type: "debit",
          amount: 30.0,
          description: "Utility bill",
          reference_id: "REF-DEBIT-1"
        });

      expect(debitRes.status).toBe(201);
      expect(debitRes.body.type).toBe("debit");
      expect(debitRes.body.amount).toBe(30.0);
      expect(debitRes.body.resulting_balance).toBe(70.0);

      const bal = await request(app).get(`/api/accounts/${accountId}/balance`);
      expect(bal.body.balance).toBe(70.0);
    });

    it("should reject debit transaction if account has insufficient balance and leave balance unchanged", async () => {
      // Setup balance of 100
      await request(app)
        .post(`/api/accounts/${accountId}/transactions`)
        .send({
          type: "credit",
          amount: 100.0,
          description: "Deposit",
          reference_id: "REF-INIT"
        });

      // Attempt debit 150 -> Overdraft rejected
      const debitRes = await request(app)
        .post(`/api/accounts/${accountId}/transactions`)
        .send({
          type: "debit",
          amount: 150.0,
          description: "Expensive gadget",
          reference_id: "REF-OVERDRAFT"
        });

      expect(debitRes.status).toBe(400);
      expect(debitRes.body.error).toBe("INSUFFICIENT_FUNDS");
      expect(debitRes.body.current_balance).toBe(100.0);
      expect(debitRes.body.requested_amount).toBe(150.0);

      // Verify balance remains exactly 100
      const bal = await request(app).get(`/api/accounts/${accountId}/balance`);
      expect(bal.body.balance).toBe(100.0);
    });
  });

  describe("Duplicate Transactions (reference_id)", () => {
    it("should reject duplicate reference_id within the same account and not alter balance", async () => {
      // 1. First transaction succeeds
      const firstRes = await request(app)
        .post(`/api/accounts/${accountId}/transactions`)
        .send({
          type: "credit",
          amount: 100.0,
          description: "Invoice #101",
          reference_id: "INV-101"
        });
      expect(firstRes.status).toBe(201);

      // 2. Resubmit with EXACT same reference_id for same account
      const dupRes = await request(app)
        .post(`/api/accounts/${accountId}/transactions`)
        .send({
          type: "credit",
          amount: 100.0,
          description: "Duplicate Invoice #101",
          reference_id: "INV-101"
        });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error).toBe("DUPLICATE_TRANSACTION");
      expect(dupRes.body.reference_id).toBe("INV-101");

      // Verify balance did NOT change (remains 100, not 200)
      const bal = await request(app).get(`/api/accounts/${accountId}/balance`);
      expect(bal.body.balance).toBe(100.0);

      // Verify only 1 transaction exists
      const history = await request(app).get(`/api/accounts/${accountId}/transactions`);
      expect(history.body.transactions.length).toBe(1);
    });

    it("should allow the same reference_id to be used for DIFFERENT accounts", async () => {
      // Create second account
      const acc2Res = await request(app).post("/api/accounts").send({ name: "Bob Ledger" });
      const accountId2 = acc2Res.body.id;

      // Use REF-SHARED for account 1
      const tx1 = await request(app)
        .post(`/api/accounts/${accountId}/transactions`)
        .send({
          type: "credit",
          amount: 50.0,
          description: "Account 1 deposit",
          reference_id: "REF-SHARED"
        });
      expect(tx1.status).toBe(201);

      // Use SAME reference_id REF-SHARED for account 2 -> MUST SUCCEED
      const tx2 = await request(app)
        .post(`/api/accounts/${accountId2}/transactions`)
        .send({
          type: "credit",
          amount: 75.0,
          description: "Account 2 deposit",
          reference_id: "REF-SHARED"
        });
      expect(tx2.status).toBe(201);

      const bal1 = await request(app).get(`/api/accounts/${accountId}/balance`);
      const bal2 = await request(app).get(`/api/accounts/${accountId2}/balance`);

      expect(bal1.body.balance).toBe(50.0);
      expect(bal2.body.balance).toBe(75.0);
    });
  });

  describe("Input Validation & Edge Cases", () => {
    it("should reject negative or zero amounts", async () => {
      const zeroRes = await request(app)
        .post(`/api/accounts/${accountId}/transactions`)
        .send({
          type: "credit",
          amount: 0,
          description: "Zero deposit",
          reference_id: "REF-ZERO"
        });
      expect(zeroRes.status).toBe(400);

      const negRes = await request(app)
        .post(`/api/accounts/${accountId}/transactions`)
        .send({
          type: "credit",
          amount: -50,
          description: "Negative deposit",
          reference_id: "REF-NEG"
        });
      expect(negRes.status).toBe(400);
    });

    it("should return 404 if account does not exist", async () => {
      const res = await request(app)
        .post(`/api/accounts/non_existent_account/transactions`)
        .send({
          type: "credit",
          amount: 50,
          description: "Deposit",
          reference_id: "REF-999"
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("ACCOUNT_NOT_FOUND");
    });
  });
});
