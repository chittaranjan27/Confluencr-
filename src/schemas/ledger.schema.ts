import { z } from "zod";

export const CreateAccountSchema = z.object({
  name: z.string({
    required_error: "Account holder name is required"
  }).trim().min(1, "Account holder name cannot be empty").max(100, "Account holder name cannot exceed 100 characters"),
  balance: z.any().optional().refine(
    (val) => val === undefined,
    {
      message: "Client is not permitted to set the initial balance. All accounts must be initialized with balance 0.00."
    }
  )
});

export const AddTransactionSchema = z.object({
  account_id: z.string().optional(),
  type: z.enum(["credit", "debit"], {
    errorMap: () => ({ message: "Transaction type must be either 'credit' or 'debit'" })
  }),
  amount: z.number({
    required_error: "Amount is required",
    invalid_type_error: "Amount must be a positive number"
  }).positive("Amount must be greater than 0")
    .refine((val) => Number.isFinite(val), "Amount must be a finite number")
    .refine(
      (val) => {
        const str = val.toString();
        const decimalParts = str.split(".");
        return decimalParts.length === 1 || decimalParts[1].length <= 2;
      },
      "Amount cannot have more than 2 decimal places"
    ),
  description: z.string({
    required_error: "Description is required"
  }).trim().min(1, "Description cannot be empty").max(500, "Description cannot exceed 500 characters"),
  reference_id: z.string({
    required_error: "reference_id is required"
  }).trim().min(1, "reference_id cannot be empty").max(100, "reference_id cannot exceed 100 characters")
});

export const TransactionHistoryQuerySchema = z.object({
  type: z.enum(["credit", "debit"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type AddTransactionInput = z.infer<typeof AddTransactionSchema>;
export type TransactionHistoryQuery = z.infer<typeof TransactionHistoryQuerySchema>;
