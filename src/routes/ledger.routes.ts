import { Router, Request, Response } from "express";
import { LedgerController } from "../controllers/ledger.controller.js";

export function createLedgerRouter(controller?: LedgerController): Router {
  const router = Router();
  const ledgerController = controller || new LedgerController();

  // 1. Create Account
  router.post("/accounts", ledgerController.createAccount);

  // List Accounts
  router.get("/accounts", ledgerController.listAccounts);

  // 3. Get Account Balance
  router.get("/accounts/:accountId/balance", ledgerController.getAccountBalance);
  router.get("/accounts/:accountId", ledgerController.getAccountBalance); // convenience route

  // 2. Add Transaction
  router.post("/accounts/:accountId/transactions", ledgerController.addTransaction);
  router.post("/transactions", ledgerController.addTransaction); // Alternative top-level endpoint

  // 4. Get Transaction History (supports ?type=credit|debit&page=1&limit=10)
  router.get("/accounts/:accountId/transactions", ledgerController.getTransactionHistory);

  // 5. Data Integrity Audit Reconciliation
  router.get("/accounts/:accountId/audit", ledgerController.auditAccount);

  // Requirement 5: Explicitly reject any modification or deletion to enforce immutability
  const rejectMutation = (_req: Request, res: Response) => {
    res.status(405).json({
      error: "METHOD_NOT_ALLOWED",
      message: "Transactions are strictly immutable. Updating or deleting transactions is prohibited."
    });
  };

  router.put("/accounts/:accountId/transactions/:transactionId?", rejectMutation);
  router.patch("/accounts/:accountId/transactions/:transactionId?", rejectMutation);
  router.delete("/accounts/:accountId/transactions/:transactionId?", rejectMutation);
  router.put("/transactions/:transactionId?", rejectMutation);
  router.patch("/transactions/:transactionId?", rejectMutation);
  router.delete("/transactions/:transactionId?", rejectMutation);

  return router;
}
