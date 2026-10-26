import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { initDatabase, closeDatabase } from "../src/config/database.js";
import { LedgerService } from "../src/services/ledger.service.js";

describe("Account APIs (Requirement 1 & 3)", () => {
  let app: any;

  beforeEach(() => {
    // In-memory isolated database for each test run
    const db = initDatabase(":memory:");
    const service = new LedgerService(db);
    app = createApp(service);
  });

  afterEach(() => {
    closeDatabase();
  });

  describe("POST /api/accounts (Requirement 1)", () => {
    it("should successfully create an account with balance 0.00 and system generated fields", async () => {
      const res = await request(app)
        .post("/api/accounts")
        .send({ name: "Alice Smith" });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(typeof res.body.id).toBe("string");
      expect(res.body.id.length).toBeGreaterThan(0);
      expect(res.body.name).toBe("Alice Smith");
      expect(res.body.balance).toBe(0.0);
      expect(res.body).toHaveProperty("created_at");
      expect(new Date(res.body.created_at).getTime()).not.toBeNaN();
    });

    it("should reject account creation if name is missing or empty", async () => {
      const missingRes = await request(app)
        .post("/api/accounts")
        .send({});

      expect(missingRes.status).toBe(400);
      expect(missingRes.body.error).toBe("VALIDATION_ERROR");

      const emptyRes = await request(app)
        .post("/api/accounts")
        .send({ name: "   " });

      expect(emptyRes.status).toBe(400);
      expect(emptyRes.body.error).toBe("VALIDATION_ERROR");
    });

    it("should reject client attempt to set initial balance", async () => {
      const res = await request(app)
        .post("/api/accounts")
        .send({ name: "Bob Jones", balance: 500 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("VALIDATION_ERROR");
      expect(res.body.issues[0].message).toContain("Client is not permitted to set the initial balance");
    });

    it("should generate unique IDs for different accounts", async () => {
      const acc1 = await request(app).post("/api/accounts").send({ name: "User One" });
      const acc2 = await request(app).post("/api/accounts").send({ name: "User Two" });

      expect(acc1.body.id).not.toBe(acc2.body.id);
    });
  });

  describe("GET /api/accounts/:accountId/balance (Requirement 3)", () => {
    it("should return current balance for an existing account", async () => {
      const createRes = await request(app).post("/api/accounts").send({ name: "Charlie" });
      const accountId = createRes.body.id;

      const res = await request(app).get(`/api/accounts/${accountId}/balance`);
      expect(res.status).toBe(200);
      expect(res.body.account_id).toBe(accountId);
      expect(res.body.balance).toBe(0.0);
    });

    it("should return 404 Not Found if account does not exist", async () => {
      const res = await request(app).get("/api/accounts/non_existent_acc/balance");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("ACCOUNT_NOT_FOUND");
      expect(res.body.message).toContain("non_existent_acc");
    });
  });
});
