/**
 * Currency utilities for financial precision.
 * Internally, all balances and amounts are stored as integer cents to avoid IEEE 754 floating-point inaccuracies.
 */

export function decimalToCents(amount: number): number {
  if (typeof amount !== "number" || isNaN(amount) || !isFinite(amount)) {
    throw new Error("Invalid monetary amount");
  }
  
  // Round to nearest integer cent to prevent fractional cents
  return Math.round(amount * 100);
}

export function centsToDecimal(cents: number): number {
  if (typeof cents !== "number" || isNaN(cents)) {
    throw new Error("Invalid cents value");
  }
  
  return Number((cents / 100).toFixed(2));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}
