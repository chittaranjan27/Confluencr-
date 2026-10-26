import { v4 as uuidv4 } from "uuid";

export function generateAccountId(): string {
  return `acc_${uuidv4().replace(/-/g, "")}`;
}

export function generateTransactionId(): string {
  return `txn_${uuidv4().replace(/-/g, "")}`;
}
