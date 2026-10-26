export const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "Transaction Ledger API",
    version: "1.0.0",
    description:
      "A production-grade Transaction Ledger API featuring ACID compliance, zero floating-point drift, duplicate transaction prevention, and verifiable ledger auditability."
  },
  servers: [
    {
      url: "/api",
      description: "Default API server"
    }
  ],
  paths: {
    "/accounts": {
      post: {
        summary: "1. Create a new account",
        description: "Creates an account with initial balance strictly 0.00.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: {
                    type: "string",
                    example: "John Doe"
                  }
                }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Account created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string", example: "acc_4b02e7b..." },
                    name: { type: "string", example: "John Doe" },
                    balance: { type: "number", example: 0.0 },
                    created_at: { type: "string", example: "2026-10-26T12:00:00.000Z" }
                  }
                }
              }
            }
          },
          "400": {
            description: "Validation error or client attempted to set balance"
          }
        }
      },
      get: {
        summary: "List all accounts",
        description: "Returns a list of all accounts with current balances.",
        responses: {
          "200": {
            description: "Accounts list"
          }
        }
      }
    },
    "/accounts/{accountId}/balance": {
      get: {
        summary: "3. Get Account Balance",
        description: "Fetches current balance of an account.",
        parameters: [
          {
            name: "accountId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": {
            description: "Account balance",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    account_id: { type: "string" },
                    balance: { type: "number", example: 150.0 },
                    name: { type: "string" },
                    created_at: { type: "string" }
                  }
                }
              }
            }
          },
          "404": {
            description: "Account not found"
          }
        }
      }
    },
    "/accounts/{accountId}/transactions": {
      post: {
        summary: "2. Add Transaction",
        description: "Performs an atomic credit or debit transaction on an account.",
        parameters: [
          {
            name: "accountId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["type", "amount", "description", "reference_id"],
                properties: {
                  type: {
                    type: "string",
                    enum: ["credit", "debit"],
                    example: "credit"
                  },
                  amount: {
                    type: "number",
                    example: 100.5
                  },
                  description: {
                    type: "string",
                    example: "Salary payment"
                  },
                  reference_id: {
                    type: "string",
                    example: "REF-2026-001"
                  }
                }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Transaction created successfully"
          },
          "400": {
            description: "Validation error or Insufficient balance"
          },
          "404": {
            description: "Account not found"
          },
          "409": {
            description: "Duplicate transaction reference_id"
          }
        }
      },
      get: {
        summary: "4. Get Transaction History",
        description: "Fetches paginated, sorted, and filtered transaction history.",
        parameters: [
          {
            name: "accountId",
            in: "path",
            required: true,
            schema: { type: "string" }
          },
          {
            name: "type",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["credit", "debit"] }
          },
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", default: 1 }
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", default: 10 }
          }
        ],
        responses: {
          "200": {
            description: "Paginated transactions list"
          },
          "404": {
            description: "Account not found"
          }
        }
      }
    },
    "/accounts/{accountId}/audit": {
      get: {
        summary: "5. Audit Ledger Integrity",
        description: "Recalculates balance from scratch to verify mathematical consistency.",
        parameters: [
          {
            name: "accountId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": {
            description: "Audit reconciliation report"
          }
        }
      }
    }
  }
};
