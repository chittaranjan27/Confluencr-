import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { initDatabase, closeDatabase } from "../src/config/database.js";
import { LedgerService } from "../src/services/ledger.service.js";

describe("Transaction History APIs (Requirement 4)", () => {
  let app: any;
  let accountId: string;

  beforeEach(async () => {
    const db = initDatabase(":memory:");
    const service = new LedgerService(db);
    app = createApp(service);

    const accRes = await request(app).post("/api/accounts").send({ name: "History Test User" });
    accountId = accRes.body.id;

    // Seed 5 transactions with distinct timestamps & types
    // Tx 1: Credit $100
    await request(app)
      .post(`/api/accounts/${accountId}/transactions`)
      .send({ type: "credit", amount: 100, description: "Tx 1 Credit", reference_id: "REF-H1" });

    // Tx 2: Credit $50
    await request(app)
      .post(`/api/accounts/${accountId}/transactions`)
      .send({ type: "credit", amount: 50, description: "Tx 2 Credit", reference_id: "REF-H2" });

    // Tx 3: Debit $20
    await request(app)
      .post(`/api/accounts/${accountId}/transactions`)
      .send({ type: "debit", amount: 20, description: "Tx 3 Debit", reference_id: "REF-H3" });

    // Tx 4: Debit $15
    await request(app)
      .post(`/api/accounts/${accountId}/transactions`)
      .send({ type: "debit", amount: 15, description: "Tx 4 Debit", reference_id: "REF-H4" });

    // Tx 5: Credit $30
    await request(app)
      .post(`/api/accounts/${accountId}/transactions`)
      .send({ type: "credit", amount: 30, description: "Tx 5 Credit", reference_id: "REF-H5" });
  });

  afterEach(() => {
    closeDatabase();
  });

  describe("Filtering by Transaction Type", () => {
    it("should return both credit and debit transactions when no type is provided", async () => {
      const res = await request(app).get(`/api/accounts/${accountId}/transactions`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.total_records).toBe(5);
      expect(res.body.transactions.length).toBe(5);

      const types = res.body.transactions.map((t: any) => t.type);
      expect(types).toContain("credit");
      expect(types).toContain("debit");
    });

    it("should filter transactions by type: credit", async () => {
      const res = await request(app).get(`/api/accounts/${accountId}/transactions?type=credit`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.total_records).toBe(3);
      expect(res.body.transactions.every((t: any) => t.type === "credit")).toBe(true);
    });

    it("should filter transactions by type: debit", async () => {
      const res = await request(app).get(`/api/accounts/${accountId}/transactions?type=debit`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.total_records).toBe(2);
      expect(res.body.transactions.every((t: any) => t.type === "debit")).toBe(true);
    });
  });

  describe("Pagination", () => {
    it("should paginate results correctly with page and limit", async () => {
      // Page 1, limit 2
      const page1 = await request(app).get(`/api/accounts/${accountId}/transactions?page=1&limit=2`);
      expect(page1.status).toBe(200);
      expect(page1.body.pagination.current_page).toBe(1);
      expect(page1.body.pagination.page_size).toBe(2);
      expect(page1.body.pagination.total_records).toBe(5);
      expect(page1.body.pagination.total_pages).toBe(3);
      expect(page1.body.transactions.length).toBe(2);

      // Page 2, limit 2
      const page2 = await request(app).get(`/api/accounts/${accountId}/transactions?page=2&limit=2`);
      expect(page2.status).toBe(200);
      expect(page2.body.pagination.current_page).toBe(2);
      expect(page2.body.transactions.length).toBe(2);

      // Verify no overlap between page 1 and page 2
      const p1Ids = page1.body.transactions.map((t: any) => t.id);
      const p2Ids = page2.body.transactions.map((t: any) => t.id);
      expect(p1Ids.some((id: string) => p2Ids.includes(id))).toBe(false);

      // Page 3, limit 2 (last remaining item)
      const page3 = await request(app).get(`/api/accounts/${accountId}/transactions?page=3&limit=2`);
      expect(page3.body.pagination.current_page).toBe(3);
      expect(page3.body.transactions.length).toBe(1);
    });
  });

  describe("Sorting", () => {
    it("should return transactions in latest-first order based on created_at", async () => {
      const res = await request(app).get(`/api/accounts/${accountId}/transactions`);
      const transactions = res.body.transactions;

      for (let i = 0; i < transactions.length - 1; i++) {
        const currentTimestamp = new Date(transactions[i].created_at).getTime();
        const nextTimestamp = new Date(transactions[i + 1].created_at).getTime();
        expect(currentTimestamp).toBeGreaterThanOrEqual(nextTimestamp);
      }

      // Most recent should be Tx 5
      expect(transactions[0].reference_id).toBe("REF-H5");
    });
  });

  describe("Error Scenarios", () => {
    it("should return 404 if account does not exist", async () => {
      const res = await request(app).get(`/api/accounts/non_existent_id/transactions`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("ACCOUNT_NOT_FOUND");
    });
  });
});
