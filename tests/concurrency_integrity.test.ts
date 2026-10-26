import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { initDatabase, closeDatabase } from "../src/config/database.js";
import { LedgerService } from "../src/services/ledger.service.js";

describe("Data Integrity & Concurrency (Requirement 5)", () => {
  let app: any;
  let db: any;
  let accountId: string;

  beforeEach(async () => {
    db = initDatabase(":memory:");
    const service = new LedgerService(db);
    app = createApp(service);

    const accRes = await request(app).post("/api/accounts").send({ name: "Integrity Test Account" });
    accountId = accRes.body.id;
  });

  afterEach(() => {
    closeDatabase();
  });

  describe("Transaction Immutability", () => {
    it("should reject any attempts to edit or delete transactions via API with 405 Method Not Allowed", async () => {
      const txRes = await request(app)
        .post(`/api/accounts/${accountId}/transactions`)
        .send({ type: "credit", amount: 50, description: "Immutable deposit", reference_id: "REF-IMM-1" });
      const txId = txRes.body.id;

      // Try PUT
      const putRes = await request(app).put(`/api/accounts/${accountId}/transactions/${txId}`).send({ amount: 999 });
      expect(putRes.status).toBe(405);
      expect(putRes.body.error).toBe("METHOD_NOT_ALLOWED");

      // Try PATCH
      const patchRes = await request(app).patch(`/api/accounts/${accountId}/transactions/${txId}`).send({ amount: 999 });
      expect(patchRes.status).toBe(405);

      // Try DELETE
      const deleteRes = await request(app).delete(`/api/accounts/${accountId}/transactions/${txId}`);
      expect(deleteRes.status).toBe(405);
    });

    it("should reject direct database UPDATE or DELETE on transactions table via triggers", () => {
      // Direct insertion
      db.prepare(`
        INSERT INTO transactions (id, account_id, type, amount_cents, description, reference_id, created_at)
        VALUES ('raw_tx_1', ?, 'credit', 5000, 'Test', 'RAW-1', '2026-10-26T12:00:00Z')
      `).run(accountId);

      // Attempt raw UPDATE
      expect(() => {
        db.prepare(`UPDATE transactions SET amount_cents = 99999 WHERE id = 'raw_tx_1'`).run();
      }).toThrow(/immutable/i);

      // Attempt raw DELETE
      expect(() => {
        db.prepare(`DELETE FROM transactions WHERE id = 'raw_tx_1'`).run();
      }).toThrow(/immutable/i);
    });
  });

  describe("Balance Consistency Spec Example", () => {
    it("should accurately maintain balance: Initial 0 -> Credit 100 -> Credit 50 -> Debit 30 -> Debit 20 -> Final 100", async () => {
      // 1. Initial balance: 0
      let bal = await request(app).get(`/api/accounts/${accountId}/balance`);
      expect(bal.body.balance).toBe(0.0);

      // 2. Credit 100
      await request(app).post(`/api/accounts/${accountId}/transactions`)
        .send({ type: "credit", amount: 100, description: "Credit 100", reference_id: "REF-C100" });

      // 3. Credit 50
      await request(app).post(`/api/accounts/${accountId}/transactions`)
        .send({ type: "credit", amount: 50, description: "Credit 50", reference_id: "REF-C50" });

      // 4. Debit 30
      await request(app).post(`/api/accounts/${accountId}/transactions`)
        .send({ type: "debit", amount: 30, description: "Debit 30", reference_id: "REF-D30" });

      // 5. Debit 20
      await request(app).post(`/api/accounts/${accountId}/transactions`)
        .send({ type: "debit", amount: 20, description: "Debit 20", reference_id: "REF-D20" });

      // 6. Attempt Rejected Debit 200 (overdraft)
      const rejected = await request(app).post(`/api/accounts/${accountId}/transactions`)
        .send({ type: "debit", amount: 200, description: "Debit 200", reference_id: "REF-D200" });
      expect(rejected.status).toBe(400);

      // Final balance must be 100
      bal = await request(app).get(`/api/accounts/${accountId}/balance`);
      expect(bal.body.balance).toBe(100.0);

      // Audit reconciliation check
      const auditRes = await request(app).get(`/api/accounts/${accountId}/audit`);
      expect(auditRes.status).toBe(200);
      expect(auditRes.body.is_consistent).toBe(true);
      expect(auditRes.body.current_balance).toBe(100.0);
      expect(auditRes.body.calculated_balance).toBe(100.0);
      expect(auditRes.body.total_credits).toBe(150.0);
      expect(auditRes.body.total_debits).toBe(50.0);
    });
  });

  describe("Concurrency Stress Test", () => {
    it("should safely handle concurrent debits without negative balance or race conditions", async () => {
      // Fund account with $100.00
      await request(app).post(`/api/accounts/${accountId}/transactions`)
        .send({ type: "credit", amount: 100, description: "Seed 100", reference_id: "SEED-100" });

      // Fire 10 simultaneous debit requests of $20 each ($200 total attempted)
      const debitPromises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post(`/api/accounts/${accountId}/transactions`)
          .send({
            type: "debit",
            amount: 20,
            description: `Concurrent debit ${i}`,
            reference_id: `CONC-DEBIT-${i}`
          })
      );

      const results = await Promise.all(debitPromises);

      const successes = results.filter((r) => r.status === 201);
      const rejections = results.filter((r) => r.status === 400);

      // Exactly 5 debits of $20 must succeed (5 * 20 = 100)
      expect(successes.length).toBe(5);
      // Exactly 5 debits must be rejected with INSUFFICIENT_FUNDS
      expect(rejections.length).toBe(5);

      // Final balance must be exactly $0.00, never negative
      const finalBal = await request(app).get(`/api/accounts/${accountId}/balance`);
      expect(finalBal.body.balance).toBe(0.0);

      // Audit must be 100% consistent
      const audit = await request(app).get(`/api/accounts/${accountId}/audit`);
      expect(audit.body.is_consistent).toBe(true);
      expect(audit.body.current_balance).toBe(0.0);
      expect(audit.body.calculated_balance).toBe(0.0);
    });
  });
});
