// State
let state = {
  accounts: [],
  selectedAccountId: null,
  activeAccount: null,
  transactions: [],
  currentPage: 1,
  limit: 10,
  filterType: "",
  totalPages: 1,
  totalRecords: 0
};

// DOM Elements
const accountSelector = document.getElementById("account-selector");
const balanceAmount = document.getElementById("balance-amount");
const holderName = document.getElementById("holder-name");
const accountIdVal = document.getElementById("account-id-val");
const copyIdBtn = document.getElementById("copy-id-btn");
const refreshBtn = document.getElementById("refresh-btn");
const runAuditBtn = document.getElementById("run-audit-btn");
const auditResultBox = document.getElementById("audit-result-box");

const createAccountForm = document.getElementById("create-account-form");
const newAccountName = document.getElementById("new-account-name");

const addTransactionForm = document.getElementById("add-transaction-form");
const txAmount = document.getElementById("tx-amount");
const txReference = document.getElementById("tx-reference");
const txDescription = document.getElementById("tx-description");
const genRefBtn = document.getElementById("gen-ref-btn");

const filterType = document.getElementById("filter-type");
const pageLimit = document.getElementById("page-limit");
const transactionsBody = document.getElementById("transactions-body");
const paginationInfo = document.getElementById("pagination-info");
const pageIndicator = document.getElementById("page-indicator");
const btnPrevPage = document.getElementById("btn-prev-page");
const btnNextPage = document.getElementById("btn-next-page");

const toastContainer = document.getElementById("toast-container");

// Presets
const presetCredit100 = document.getElementById("preset-credit-100");
const presetDebit30 = document.getElementById("preset-debit-30");
const presetOverdraft = document.getElementById("preset-overdraft");
const presetDuplicate = document.getElementById("preset-duplicate");

// Helpers
function formatCurrency(val) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(val);
}

function formatDate(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function generateRandomRef() {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `REF-${rand}`;
}

function showToast(title, message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div>
      <span class="toast-title">${title}</span>
      <p class="toast-message">${message}</p>
    </div>
  `;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(30px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// API Calls
async function fetchAccounts() {
  try {
    const res = await fetch("/api/accounts");
    const data = await res.json();
    state.accounts = data.accounts || [];

    renderAccountSelector();

    if (state.accounts.length > 0) {
      if (!state.selectedAccountId || !state.accounts.find(a => a.id === state.selectedAccountId)) {
        selectAccount(state.accounts[0].id);
      } else {
        await fetchAccountBalance(state.selectedAccountId);
        await fetchTransactions();
      }
    } else {
      renderEmptyState();
    }
  } catch (err) {
    showToast("Error", "Failed to load accounts: " + err.message, "error");
  }
}

function renderAccountSelector() {
  accountSelector.innerHTML = "";
  if (state.accounts.length === 0) {
    accountSelector.innerHTML = `<option value="">No accounts exist yet. Create one!</option>`;
    return;
  }

  state.accounts.forEach(acc => {
    const opt = document.createElement("option");
    opt.value = acc.id;
    opt.textContent = `${acc.name} (${formatCurrency(acc.balance)})`;
    if (acc.id === state.selectedAccountId) {
      opt.selected = true;
    }
    accountSelector.appendChild(opt);
  });
}

async function selectAccount(accountId) {
  state.selectedAccountId = accountId;
  accountSelector.value = accountId;
  state.currentPage = 1;
  auditResultBox.classList.add("hidden");
  await fetchAccountBalance(accountId);
  await fetchTransactions();
}

async function fetchAccountBalance(accountId) {
  try {
    const res = await fetch(`/api/accounts/${accountId}/balance`);
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    const data = await res.json();
    state.activeAccount = data;

    balanceAmount.textContent = formatCurrency(data.balance);
    holderName.textContent = data.name || "—";
    accountIdVal.textContent = data.account_id;

    // Refresh option title in dropdown
    const opt = accountSelector.querySelector(`option[value="${accountId}"]`);
    if (opt) {
      opt.textContent = `${data.name} (${formatCurrency(data.balance)})`;
    }
  } catch (err) {
    showToast("Balance Error", err.message, "error");
  }
}

async function fetchTransactions() {
  if (!state.selectedAccountId) return;

  try {
    let url = `/api/accounts/${state.selectedAccountId}/transactions?page=${state.currentPage}&limit=${state.limit}`;
    if (state.filterType) {
      url += `&type=${state.filterType}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    state.transactions = data.transactions || [];
    state.currentPage = data.pagination.current_page;
    state.totalPages = data.pagination.total_pages;
    state.totalRecords = data.pagination.total_records;

    renderTransactions();
    renderPagination();
  } catch (err) {
    showToast("History Error", "Could not load transactions: " + err.message, "error");
  }
}

function renderTransactions() {
  transactionsBody.innerHTML = "";

  if (state.transactions.length === 0) {
    transactionsBody.innerHTML = `
      <tr>
        <td colspan="5" class="table-empty">
          No transactions found for this account ${state.filterType ? `matching filter '${state.filterType}'` : ""}.
        </td>
      </tr>
    `;
    return;
  }

  state.transactions.forEach(tx => {
    const tr = document.createElement("tr");
    const isCredit = tx.type === "credit";

    tr.innerHTML = `
      <td class="mono" style="font-size: 0.78rem;">${formatDate(tx.created_at)}</td>
      <td>
        <span class="tag-badge ${isCredit ? 'tag-credit' : 'tag-debit'}">
          ${isCredit ? '+ CREDIT' : '- DEBIT'}
        </span>
      </td>
      <td><span class="mono" style="color: var(--accent-primary); font-size: 0.82rem;">${tx.reference_id}</span></td>
      <td>${escapeHtml(tx.description)}</td>
      <td class="text-right ${isCredit ? 'amount-credit' : 'amount-debit'}">
        ${isCredit ? '+' : '-'}${formatCurrency(tx.amount)}
      </td>
    `;
    transactionsBody.appendChild(tr);
  });
}

function renderPagination() {
  const start = state.totalRecords > 0 ? (state.currentPage - 1) * state.limit + 1 : 0;
  const end = Math.min(state.currentPage * state.limit, state.totalRecords);

  paginationInfo.textContent = `Showing ${start}–${end} of ${state.totalRecords} transactions`;
  pageIndicator.textContent = `Page ${state.currentPage} of ${state.totalPages || 1}`;

  btnPrevPage.disabled = state.currentPage <= 1;
  btnNextPage.disabled = state.currentPage >= state.totalPages || state.totalPages === 0;
}

function renderEmptyState() {
  balanceAmount.textContent = "$0.00";
  holderName.textContent = "—";
  accountIdVal.textContent = "—";
  transactionsBody.innerHTML = `
    <tr>
      <td colspan="5" class="table-empty">Please create an account to begin using the ledger.</td>
    </tr>
  `;
  paginationInfo.textContent = "0 transactions";
  pageIndicator.textContent = "Page 1 of 1";
  btnPrevPage.disabled = true;
  btnNextPage.disabled = true;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Event Listeners
accountSelector.addEventListener("change", (e) => {
  if (e.target.value) {
    selectAccount(e.target.value);
  }
});

refreshBtn.addEventListener("click", async () => {
  if (state.selectedAccountId) {
    await fetchAccountBalance(state.selectedAccountId);
    await fetchTransactions();
    showToast("Refreshed", "Account and ledger data reloaded", "success");
  }
});

copyIdBtn.addEventListener("click", () => {
  if (state.selectedAccountId) {
    navigator.clipboard.writeText(state.selectedAccountId);
    showToast("Copied", "Account ID copied to clipboard", "success");
  }
});

genRefBtn.addEventListener("click", () => {
  txReference.value = generateRandomRef();
});

filterType.addEventListener("change", (e) => {
  state.filterType = e.target.value;
  state.currentPage = 1;
  fetchTransactions();
});

pageLimit.addEventListener("change", (e) => {
  state.limit = parseInt(e.target.value, 10);
  state.currentPage = 1;
  fetchTransactions();
});

btnPrevPage.addEventListener("click", () => {
  if (state.currentPage > 1) {
    state.currentPage--;
    fetchTransactions();
  }
});

btnNextPage.addEventListener("click", () => {
  if (state.currentPage < state.totalPages) {
    state.currentPage++;
    fetchTransactions();
  }
});

// Create Account Form
createAccountForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newAccountName.value.trim();
  if (!name) return;

  try {
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || "Failed to create account");
    }

    showToast("Account Created", `Account '${data.name}' initialized with balance $0.00`, "success");
    newAccountName.value = "";

    await fetchAccounts();
    selectAccount(data.id);
  } catch (err) {
    showToast("Create Error", err.message, "error");
  }
});

// Add Transaction Form
addTransactionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.selectedAccountId) {
    showToast("Warning", "Please create or select an account first", "warning");
    return;
  }

  const type = document.querySelector('input[name="tx-type"]:checked').value;
  const amount = parseFloat(txAmount.value);
  const reference_id = txReference.value.trim();
  const description = txDescription.value.trim();

  await executeTransaction({
    account_id: state.selectedAccountId,
    type,
    amount,
    reference_id,
    description
  });
});

async function executeTransaction(payload) {
  try {
    const res = await fetch(`/api/accounts/${payload.account_id}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 409) {
        showToast("409 Conflict: Duplicate Transaction", data.message, "warning");
      } else if (res.status === 400 && data.error === "INSUFFICIENT_FUNDS") {
        showToast("400 Bad Request: Overdraft Rejected", data.message, "error");
      } else {
        showToast(`Error (${res.status})`, data.message || "Transaction failed", "error");
      }
      return false;
    }

    showToast("Transaction Recorded", `${payload.type.toUpperCase()} of ${formatCurrency(payload.amount)} succeeded. New Balance: ${formatCurrency(data.resulting_balance)}`, "success");

    // Reset fields
    txAmount.value = "";
    txDescription.value = "";
    txReference.value = generateRandomRef();

    // Refresh UI
    await fetchAccountBalance(state.selectedAccountId);
    await fetchTransactions();
    return true;
  } catch (err) {
    showToast("Network Error", err.message, "error");
    return false;
  }
}

// Preset Handlers
presetCredit100.addEventListener("click", () => {
  document.querySelector('input[name="tx-type"][value="credit"]').checked = true;
  txAmount.value = "100.00";
  txReference.value = generateRandomRef();
  txDescription.value = "Quick credit deposit";
});

presetDebit30.addEventListener("click", () => {
  document.querySelector('input[name="tx-type"][value="debit"]').checked = true;
  txAmount.value = "30.00";
  txReference.value = generateRandomRef();
  txDescription.value = "Quick debit payment";
});

presetOverdraft.addEventListener("click", async () => {
  if (!state.selectedAccountId) {
    showToast("Warning", "Select an account first", "warning");
    return;
  }
  const currentBal = state.activeAccount ? state.activeAccount.balance : 0;
  const overdraftAmount = currentBal + 500;

  document.querySelector('input[name="tx-type"][value="debit"]').checked = true;
  txAmount.value = overdraftAmount.toFixed(2);
  txReference.value = generateRandomRef();
  txDescription.value = "Test Overdraft Transaction";

  showToast("Testing Overdraft", `Attempting debit of ${formatCurrency(overdraftAmount)} against balance ${formatCurrency(currentBal)}...`, "warning");
  await executeTransaction({
    account_id: state.selectedAccountId,
    type: "debit",
    amount: overdraftAmount,
    reference_id: txReference.value,
    description: txDescription.value
  });
});

presetDuplicate.addEventListener("click", async () => {
  if (!state.selectedAccountId) {
    showToast("Warning", "Select an account first", "warning");
    return;
  }
  const dupRef = "DUP-TEST-" + Math.floor(Math.random() * 900 + 100);

  showToast("Step 1/2", `Executing initial credit with reference '${dupRef}'...`, "success");
  const success1 = await executeTransaction({
    account_id: state.selectedAccountId,
    type: "credit",
    amount: 25.00,
    reference_id: dupRef,
    description: "Original payment for duplicate test"
  });

  if (success1) {
    setTimeout(async () => {
      showToast("Step 2/2", `Resubmitting SAME reference '${dupRef}' to test duplicate rejection...`, "warning");
      await executeTransaction({
        account_id: state.selectedAccountId,
        type: "credit",
        amount: 25.00,
        reference_id: dupRef,
        description: "Attempted duplicate transaction"
      });
    }, 1200);
  }
});

// Run Ledger Audit Reconciliation
runAuditBtn.addEventListener("click", async () => {
  if (!state.selectedAccountId) {
    showToast("Warning", "Select an account first", "warning");
    return;
  }

  try {
    const res = await fetch(`/api/accounts/${state.selectedAccountId}/audit`);
    const audit = await res.json();
    if (!res.ok) throw new Error(audit.message || "Audit failed");

    auditResultBox.classList.remove("hidden");
    if (audit.is_consistent) {
      auditResultBox.className = "audit-result-box";
      auditResultBox.innerHTML = `
        <strong style="color: var(--success); display: block; margin-bottom: 4px;">✓ Ledger Mathematically Verified Consistent</strong>
        <div>Total Historical Credits: <strong>+${formatCurrency(audit.total_credits)}</strong></div>
        <div>Total Historical Debits: <strong>-${formatCurrency(audit.total_debits)}</strong></div>
        <div>Formula: <em>Credits (${formatCurrency(audit.total_credits)}) - Debits (${formatCurrency(audit.total_debits)}) = ${formatCurrency(audit.calculated_balance)}</em></div>
        <div>Verified Balance: <strong>${formatCurrency(audit.current_balance)}</strong> across ${audit.transaction_count} transaction(s).</div>
      `;
      showToast("Audit Passed", "Account balance mathematically matches 100% of transaction history.", "success");
    } else {
      auditResultBox.className = "audit-result-box error";
      auditResultBox.innerHTML = `
        <strong style="color: var(--danger); display: block; margin-bottom: 4px;">⚠ Balance Inconsistency Detected!</strong>
        <div>Current: ${formatCurrency(audit.current_balance)} | Calculated: ${formatCurrency(audit.calculated_balance)}</div>
      `;
      showToast("Audit Failed", "Discrepancy detected between transactions and balance.", "error");
    }
  } catch (err) {
    showToast("Audit Error", err.message, "error");
  }
});

// Init
window.addEventListener("DOMContentLoaded", () => {
  txReference.value = generateRandomRef();
  fetchAccounts();
});
