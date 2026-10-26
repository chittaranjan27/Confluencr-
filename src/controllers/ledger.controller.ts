import { Request, Response, NextFunction } from "express";
import { LedgerService, LedgerError } from "../services/ledger.service.js";
import {
  CreateAccountSchema,
  AddTransactionSchema,
  TransactionHistoryQuerySchema
} from "../schemas/ledger.schema.js";
import { ZodError } from "zod";

export class LedgerController {
  private service: LedgerService;

  constructor(service?: LedgerService) {
    this.service = service || new LedgerService();
  }

  /**
   * POST /api/accounts
   * Create a new account
   */
  public createAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedData = CreateAccountSchema.parse(req.body);
      const account = this.service.createAccount(validatedData.name);
      res.status(201).json(account);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * GET /api/accounts
   * List all accounts
   */
  public listAccounts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accounts = this.service.listAccounts();
      res.status(200).json({ accounts });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * GET /api/accounts/:accountId/balance
   * Get account balance
   */
  public getAccountBalance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { accountId } = req.params;
      const balance = this.service.getAccountBalance(accountId);
      res.status(200).json(balance);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * POST /api/accounts/:accountId/transactions OR POST /api/transactions
   * Add a transaction (credit or debit)
   */
  public addTransaction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = req.params.accountId || req.body.account_id;
      if (!accountId) {
        res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "account_id is required either in URL path or request body."
        });
        return;
      }

      const validatedBody = AddTransactionSchema.parse(req.body);
      const transaction = this.service.addTransaction({
        account_id: accountId,
        type: validatedBody.type,
        amount: validatedBody.amount,
        description: validatedBody.description,
        reference_id: validatedBody.reference_id
      });

      res.status(201).json(transaction);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * GET /api/accounts/:accountId/transactions
   * Get transaction history with filtering and pagination
   */
  public getTransactionHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { accountId } = req.params;
      const query = TransactionHistoryQuerySchema.parse(req.query);

      const history = this.service.getTransactionHistory({
        account_id: accountId,
        type: query.type,
        page: query.page,
        limit: query.limit
      });

      res.status(200).json(history);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * GET /api/accounts/:accountId/audit
   * Mathematical ledger integrity audit
   */
  public auditAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { accountId } = req.params;
      const audit = this.service.auditAccount(accountId);
      res.status(200).json(audit);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Standardized error response handler
   */
  private handleError(res: Response, error: unknown): void {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Invalid input data",
        issues: error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message
        }))
      });
      return;
    }

    if (error instanceof LedgerError) {
      res.status(error.statusCode).json({
        error: error.errorCode,
        message: error.message,
        ...(error.details || {})
      });
      return;
    }

    console.error("Unhandled server error:", error);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred while processing the request."
    });
  }
}
