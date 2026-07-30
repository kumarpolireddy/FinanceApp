// State Management
let sessionToken = sessionStorage.getItem('wealthiq_session_token') || null;
let accounts = [];
let categories = [];
let transactions = [];
let selectedHistoryAccountId = null;

// Filter State
const filters = {
  search: '',
  type: 'all',
  account: 'all',
  category: 'all',
  startDate: '',
  endDate: ''
};

// UI Elements
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const pairingForm = document.getElementById('pairing-form');
const pairingCodeInput = document.getElementById('pairing-code');
const authError = document.getElementById('auth-error');

// Tabs & Navigation
const navItems = document.querySelectorAll('.nav-item');
const tabViews = document.querySelectorAll('.tab-view');
const currentTabTitle = document.getElementById('current-tab-title');
const displayIp = document.getElementById('display-ip');
const disconnectBtn = document.getElementById('disconnect-btn');
const quickAddBtn = document.getElementById('quick-add-btn');

// Transaction Modal
const txModal = document.getElementById('tx-modal');
const txForm = document.getElementById('tx-form');
const modalTitle = document.getElementById('modal-title');
const txIdInput = document.getElementById('tx-id');
const txTypeRadios = document.getElementsByName('tx-type');
const txDateInput = document.getElementById('tx-date');
const txAmountInput = document.getElementById('tx-amount');
const txDescriptionInput = document.getElementById('tx-description');
const txAccountSelect = document.getElementById('tx-account');
const txToAccountSelect = document.getElementById('tx-to-account');
const txCategorySelect = document.getElementById('tx-category');
const txSubcategorySelect = document.getElementById('tx-subcategory');
const txNotesInput = document.getElementById('tx-notes');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalCloseBtn = document.getElementById('modal-close-btn');

// Toast Notification
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// API Helper
async function apiCall(method, path, body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }
  
  const options = {
    method,
    headers
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(path, options);
    if (response.status === 401) {
      // Token expired or invalid, force logout
      logout();
      showToast('Session expired. Please reconnect.', 'error');
      throw new Error('Unauthorized');
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error?.message || 'API request failed');
    }
    return data.data;
  } catch (err) {
    console.error(`API Error (${path}):`, err);
    throw err;
  }
}

// Auth Handlers
function initAuth() {
  if (sessionToken) {
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    displayIp.textContent = window.location.hostname;
    loadData();
  } else {
    authScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
  }
}

pairingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = pairingCodeInput.value.trim();
  if (code.length !== 6) return;

  const btn = document.getElementById('unlock-btn');
  btn.disabled = true;
  btn.textContent = 'Verifying...';
  authError.classList.add('hidden');

  try {
    const res = await apiCall('POST', '/api/auth/pair', { code });
    sessionToken = res.token;
    sessionStorage.setItem('wealthiq_session_token', sessionToken);
    
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    displayIp.textContent = window.location.hostname;
    
    showToast('Dashboard unlocked successfully!');
    loadData();
  } catch (err) {
    authError.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Unlock Dashboard';
  }
});

function logout() {
  sessionToken = null;
  sessionStorage.removeItem('wealthiq_session_token');
  initAuth();
}

disconnectBtn.addEventListener('click', logout);

// Tab Navigation
navItems.forEach(item => {
  item.addEventListener('click', () => {
    const tabName = item.getAttribute('data-tab');
    switchTab(tabName);
  });
});

function switchTab(tabName) {
  navItems.forEach(item => {
    if (item.getAttribute('data-tab') === tabName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  tabViews.forEach(view => {
    if (view.id === `view-${tabName}`) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });

  // Capitalize title
  const formattedTitle = tabName.charAt(0).toUpperCase() + tabName.slice(1);
  currentTabTitle.textContent = formattedTitle;

  if (tabName === 'dashboard') {
    renderDashboard();
  } else if (tabName === 'transactions') {
    renderTransactions();
  } else if (tabName === 'accounts') {
    renderAccountsTab();
  } else if (tabName === 'categories') {
    renderCategoriesTab();
  }
}

// Load Data
async function loadData() {
  try {
    // Load accounts & categories first
    accounts = await apiCall('GET', '/api/accounts');
    categories = await apiCall('GET', '/api/categories');
    transactions = await apiCall('GET', '/api/transactions');
    
    // Populate filter dropdowns
    populateFilterDropdowns();
    populateFormDropdowns();
    
    // Render default tab
    renderDashboard();
  } catch (err) {
    console.error('Failed to load initial data:', err);
    showToast('Failed to load data. Please refresh.', 'error');
  }
}

// Populate Filters
function populateFilterDropdowns() {
  const accFilter = document.getElementById('tx-filter-account');
  const catFilter = document.getElementById('tx-filter-category');
  
  // Save selected values to restore
  const selectedAcc = accFilter.value;
  const selectedCat = catFilter.value;
  
  accFilter.innerHTML = '<option value="all">All Accounts</option>';
  accounts.forEach(acc => {
    accFilter.innerHTML += `<option value="${acc.id}">${acc.name}</option>`;
  });
  
  catFilter.innerHTML = '<option value="all">All Categories</option>';
  categories.forEach(cat => {
    catFilter.innerHTML += `<option value="${cat.name}">${cat.icon || ''} ${cat.name}</option>`;
  });
  
  accFilter.value = selectedAcc;
  catFilter.value = selectedCat;
}

// Populate Form Selects
function populateFormDropdowns() {
  txAccountSelect.innerHTML = '';
  txToAccountSelect.innerHTML = '<option value="">Select Destination</option>';
  accounts.forEach(acc => {
    txAccountSelect.innerHTML += `<option value="${acc.id}">${acc.name} (Balance: ₹${acc.balance.toFixed(2)})</option>`;
    txToAccountSelect.innerHTML += `<option value="${acc.id}">${acc.name} (Balance: ₹${acc.balance.toFixed(2)})</option>`;
  });
}

// Render Dashboard
async function renderDashboard() {
  try {
    const summary = await apiCall('GET', '/api/dashboard');
    
    document.getElementById('kpi-total-balance').textContent = `₹${summary.totalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpi-income').textContent = `₹${summary.income.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpi-expenses').textContent = `₹${summary.expenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    
    const flow = summary.netCashFlow;
    const flowEl = document.getElementById('kpi-net-flow');
    flowEl.textContent = `${flow >= 0 ? '' : '-'}₹${Math.abs(flow).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    flowEl.className = flow >= 0 ? 'kpi-value text-green' : 'kpi-value text-red';

    // Recent Transactions
    const recentList = document.getElementById('dashboard-recent-transactions');
    recentList.innerHTML = '';
    
    const displayTx = summary.recentTransactions.slice(0, 10);
    if (displayTx.length === 0) {
      recentList.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No transactions found this month.</td></tr>';
    } else {
      displayTx.forEach(tx => {
        const dateStr = new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        const acc = accounts.find(a => a.id === tx.account)?.name || 'Unknown';
        const typeClass = tx.type === 'income' ? 'text-green' : tx.type === 'expense' ? 'text-red' : '';
        const prefix = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '';
        
        recentList.innerHTML += `
          <tr>
            <td class="text-muted">${dateStr}</td>
            <td class="tx-desc-cell">${tx.description}</td>
            <td><span class="badge">${tx.category}</span></td>
            <td class="text-muted">${acc}</td>
            <td class="font-bold ${typeClass}">${prefix}₹${tx.amount.toFixed(2)}</td>
          </tr>
        `;
      });
    }

    // Accounts List
    const accList = document.getElementById('dashboard-accounts-list');
    accList.innerHTML = '';
    
    accounts.forEach(acc => {
      accList.innerHTML += `
        <div class="account-item" onclick="viewAccountHistory('${acc.id}')">
          <div class="account-item-left">
            <div class="account-color-dot" style="background-color: ${acc.color || '#ccc'}"></div>
            <div class="account-name-block">
              <span class="account-item-name">${acc.name}</span>
              <span class="account-item-bank">${acc.bankName || acc.type.toUpperCase()}</span>
            </div>
          </div>
          <span class="account-item-balance ${acc.balance < 0 ? 'text-red' : ''}">
            ₹${acc.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
      `;
    });
  } catch (err) {
    showToast('Failed to load dashboard', 'error');
  }
}

// Redirect View All
document.getElementById('view-all-tx-link').addEventListener('click', () => {
  switchTab('transactions');
});

// Render Transactions Tab with Filtering
function renderTransactions() {
  const txList = document.getElementById('transactions-log-list');
  txList.innerHTML = '';
  
  // Filter Transactions
  const filtered = transactions.filter(tx => {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const descMatch = tx.description?.toLowerCase().includes(searchLower);
      const notesMatch = tx.notes?.toLowerCase().includes(searchLower);
      if (!descMatch && !notesMatch) return false;
    }
    
    // Type filter
    if (filters.type !== 'all' && tx.type !== filters.type) return false;
    
    // Account filter
    if (filters.account !== 'all' && tx.account !== filters.account && tx.toAccount !== filters.account) return false;
    
    // Category filter
    if (filters.category !== 'all' && tx.category !== filters.category) return false;
    
    // Date range filter
    if (filters.startDate && tx.date.slice(0, 10) < filters.startDate) return false;
    if (filters.endDate && tx.date.slice(0, 10) > filters.endDate) return false;
    
    return true;
  });

  // Display count
  document.getElementById('tx-count-display').textContent = `${filtered.length} transactions found`;

  if (filtered.length === 0) {
    txList.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No transactions matching the criteria.</td></tr>';
    return;
  }

  filtered.forEach(tx => {
    const formattedDate = new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const sourceAcc = accounts.find(a => a.id === tx.account)?.name || 'Unknown';
    const destAcc = tx.toAccount ? (accounts.find(a => a.id === tx.toAccount)?.name || 'Unknown') : '-';
    
    const typeClass = tx.type === 'income' ? 'text-green' : tx.type === 'expense' ? 'text-red' : 'text-muted';
    const amountPrefix = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '';

    txList.innerHTML += `
      <tr>
        <td class="text-muted" style="white-space: nowrap;">${formattedDate}</td>
        <td><span class="tx-badge badge-${tx.type}">${tx.type}</span></td>
        <td class="tx-desc-cell">${tx.description}</td>
        <td><span class="badge">${tx.category}</span></td>
        <td class="text-muted">${sourceAcc}</td>
        <td class="text-muted">${destAcc}</td>
        <td class="font-bold ${typeClass}">${amountPrefix}₹${tx.amount.toFixed(2)}</td>
        <td class="text-muted" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${tx.notes || ''}">${tx.notes || '-'}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon-only" onclick="editTransaction('${tx.id}')" title="Edit">✏️</button>
            <button class="btn-icon-only btn-delete" onclick="deleteTransaction('${tx.id}')" title="Delete">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  });
}

// Bind Filter Inputs
document.getElementById('tx-search').addEventListener('input', (e) => {
  filters.search = e.target.value;
  renderTransactions();
});
document.getElementById('tx-filter-type').addEventListener('change', (e) => {
  filters.type = e.target.value;
  renderTransactions();
});
document.getElementById('tx-filter-account').addEventListener('change', (e) => {
  filters.account = e.target.value;
  renderTransactions();
});
document.getElementById('tx-filter-category').addEventListener('change', (e) => {
  filters.category = e.target.value;
  renderTransactions();
});
document.getElementById('tx-filter-start-date').addEventListener('change', (e) => {
  filters.startDate = e.target.value;
  renderTransactions();
});
document.getElementById('tx-filter-end-date').addEventListener('change', (e) => {
  filters.endDate = e.target.value;
  renderTransactions();
});
document.getElementById('btn-reset-filters').addEventListener('click', () => {
  document.getElementById('tx-search').value = '';
  document.getElementById('tx-filter-type').value = 'all';
  document.getElementById('tx-filter-account').value = 'all';
  document.getElementById('tx-filter-category').value = 'all';
  document.getElementById('tx-filter-start-date').value = '';
  document.getElementById('tx-filter-end-date').value = '';
  
  filters.search = '';
  filters.type = 'all';
  filters.account = 'all';
  filters.category = 'all';
  filters.startDate = '';
  filters.endDate = '';
  
  renderTransactions();
});

// Render Accounts Tab
function renderAccountsTab() {
  const listEl = document.getElementById('accounts-page-list');
  listEl.innerHTML = '';
  
  accounts.forEach(acc => {
    listEl.innerHTML += `
      <div class="account-item ${selectedHistoryAccountId === acc.id ? 'active' : ''}" onclick="selectHistoryAccount('${acc.id}')">
        <div class="account-item-left">
          <div class="account-color-dot" style="background-color: ${acc.color || '#ccc'}"></div>
          <div class="account-name-block">
            <span class="account-item-name">${acc.name}</span>
            <span class="account-item-bank">${acc.bankName || acc.type.toUpperCase()}</span>
          </div>
        </div>
        <span class="account-item-balance ${acc.balance < 0 ? 'text-red' : ''}">
          ₹${acc.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      </div>
    `;
  });

  if (selectedHistoryAccountId) {
    const acc = accounts.find(a => a.id === selectedHistoryAccountId);
    if (acc) {
      document.getElementById('history-account-name').textContent = acc.name;
      document.getElementById('history-account-type').textContent = acc.type.toUpperCase();
      document.getElementById('history-account-banner').style.display = 'flex';
      document.getElementById('history-account-balance').textContent = `₹${acc.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      document.getElementById('history-account-bank').textContent = acc.bankName || 'General';

      // Load Transactions for this Account
      const historyList = document.getElementById('account-history-transactions');
      historyList.innerHTML = '';
      const accTx = transactions.filter(tx => tx.account === acc.id || tx.toAccount === acc.id);
      
      if (accTx.length === 0) {
        historyList.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No transactions found for this account.</td></tr>';
      } else {
        accTx.forEach(tx => {
          const dateStr = new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          const isDest = tx.toAccount === acc.id;
          const typeClass = tx.type === 'income' || (tx.type === 'transfer' && isDest) ? 'text-green' : 'text-red';
          const prefix = tx.type === 'income' || (tx.type === 'transfer' && isDest) ? '+' : '-';
          
          historyList.innerHTML += `
            <tr>
              <td class="text-muted">${dateStr}</td>
              <td class="tx-desc-cell">${tx.description}</td>
              <td><span class="badge">${tx.category}</span></td>
              <td><span class="tx-badge badge-${tx.type}">${tx.type}</span></td>
              <td class="font-bold ${typeClass}">${prefix}₹${tx.amount.toFixed(2)}</td>
            </tr>
          `;
        });
      }
      return;
    }
  }

  // Fallback default state
  document.getElementById('history-account-name').textContent = 'Select an Account';
  document.getElementById('history-account-type').textContent = '-';
  document.getElementById('history-account-banner').style.display = 'none';
  document.getElementById('account-history-transactions').innerHTML = '<tr><td colspan="5" class="text-center text-muted">Click an account on the left to view transaction history</td></tr>';
}

function selectHistoryAccount(id) {
  selectedHistoryAccountId = id;
  renderAccountsTab();
}

function viewAccountHistory(id) {
  selectedHistoryAccountId = id;
  switchTab('accounts');
}

// Render Categories Tab
function renderCategoriesTab() {
  const expenseGrid = document.getElementById('categories-expense-list');
  const incomeGrid = document.getElementById('categories-income-list');
  expenseGrid.innerHTML = '';
  incomeGrid.innerHTML = '';

  categories.forEach(cat => {
    const cardHtml = `
      <div class="category-card">
        <span class="category-icon" style="background-color:${cat.color}15; color:${cat.color}; padding:6px; border-radius:8px">${cat.icon || '📦'}</span>
        <div class="category-name-wrap">
          <span class="category-card-name">${cat.name}</span>
        </div>
      </div>
    `;
    if (cat.type === 'expense') {
      expenseGrid.innerHTML += cardHtml;
    } else {
      incomeGrid.innerHTML += cardHtml;
    }
  });
}

// Toast
function showToast(message, type = 'success') {
  toastMessage.textContent = message;
  toast.className = `toast ${type === 'error' ? 'border-red' : ''}`;
  toast.classList.remove('hidden');
  
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// Export Download
document.getElementById('btn-export-download').addEventListener('click', async () => {
  const btn = document.getElementById('btn-export-download');
  btn.disabled = true;
  btn.textContent = 'Generating Export...';
  try {
    const backupData = await apiCall('GET', '/api/export');
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wealthiq-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Backup JSON downloaded successfully!');
  } catch (err) {
    showToast('Export failed. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download Backup File (.json)';
  }
});

// Create/Edit Modals Handlers
quickAddBtn.addEventListener('click', () => openTxModal());
modalCancelBtn.addEventListener('click', closeTxModal);
modalCloseBtn.addEventListener('click', closeTxModal);

function openTxModal(txn = null) {
  populateFormDropdowns();
  
  // Dynamic Category Loading
  updateModalCategories();
  
  if (txn) {
    modalTitle.textContent = 'Edit Transaction';
    txIdInput.value = txn.id;
    
    // Select correct type radio
    for (const radio of txTypeRadios) {
      if (radio.value === txn.type) {
        radio.checked = true;
        break;
      }
    }
    
    // Format datetime-local value (YYYY-MM-DDTHH:MM)
    const dateObj = new Date(txn.date);
    const offset = dateObj.getTimezoneOffset();
    const localDate = new Date(dateObj.getTime() - (offset*60*1000));
    txDateInput.value = localDate.toISOString().slice(0, 16);
    
    txAmountInput.value = txn.amount;
    txDescriptionInput.value = txn.description;
    txAccountSelect.value = txn.account;
    txToAccountSelect.value = txn.toAccount || '';
    
    updateModalCategories();
    txCategorySelect.value = txn.category;
    updateSubcategoriesSelect();
    txSubcategorySelect.value = txn.subcategory || '';
    
    txNotesInput.value = txn.notes || '';
  } else {
    modalTitle.textContent = 'Add Transaction';
    txIdInput.value = '';
    
    // Default values
    txTypeRadios[0].checked = true; // expense
    
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - (offset*60*1000));
    txDateInput.value = localNow.toISOString().slice(0, 16);
    
    txAmountInput.value = '';
    txDescriptionInput.value = '';
    if (accounts.length > 0) txAccountSelect.value = accounts[0].id;
    txToAccountSelect.value = '';
    
    updateModalCategories();
    updateSubcategoriesSelect();
    txNotesInput.value = '';
  }
  
  toggleDestAccountRow();
  txModal.classList.remove('hidden');
}

function closeTxModal() {
  txModal.classList.add('hidden');
}

// Watch type change
for (const radio of txTypeRadios) {
  radio.addEventListener('change', () => {
    toggleDestAccountRow();
    updateModalCategories();
    updateSubcategoriesSelect();
  });
}

function toggleDestAccountRow() {
  const selectedType = getSelectedTxType();
  const destGroup = document.getElementById('group-dest-account');
  const sourceLabel = document.getElementById('label-source-account');
  const catRow = document.getElementById('row-category');

  if (selectedType === 'transfer') {
    destGroup.classList.remove('hidden');
    txToAccountSelect.required = true;
    sourceLabel.textContent = 'From Account';
    catRow.classList.add('hidden');
    txCategorySelect.required = false;
  } else {
    destGroup.classList.add('hidden');
    txToAccountSelect.required = false;
    sourceLabel.textContent = 'Account';
    catRow.classList.remove('hidden');
    txCategorySelect.required = true;
  }
}

function getSelectedTxType() {
  for (const radio of txTypeRadios) {
    if (radio.checked) return radio.value;
  }
  return 'expense';
}

function updateModalCategories() {
  const selectedType = getSelectedTxType();
  txCategorySelect.innerHTML = '';
  
  const filteredCats = categories.filter(c => c.type === selectedType);
  filteredCats.forEach(cat => {
    txCategorySelect.innerHTML += `<option value="${cat.name}">${cat.icon || ''} ${cat.name}</option>`;
  });
}

txCategorySelect.addEventListener('change', updateSubcategoriesSelect);

function updateSubcategoriesSelect() {
  const catName = txCategorySelect.value;
  const subSelect = document.getElementById('tx-subcategory');
  subSelect.innerHTML = '<option value="">None</option>';
  
  const cat = categories.find(c => c.name === catName);
  if (cat && cat.subcategories && cat.subcategories.length > 0) {
    cat.subcategories.forEach(sub => {
      subSelect.innerHTML += `<option value="${sub}">${sub}</option>`;
    });
  }
}

// Form Submission
txForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = txIdInput.value;
  const type = getSelectedTxType();
  const amount = parseFloat(txAmountInput.value);
  const description = txDescriptionInput.value.trim();
  const account = txAccountSelect.value;
  const toAccount = type === 'transfer' ? txToAccountSelect.value : undefined;
  const category = type === 'transfer' ? 'Transfer' : txCategorySelect.value;
  const subcategory = type === 'transfer' ? undefined : (txSubcategorySelect.value || undefined);
  const dateVal = txDateInput.value; // Local YYYY-MM-DDTHH:MM
  const notes = txNotesInput.value.trim() || undefined;

  // Validate values
  if (isNaN(amount) || amount <= 0) {
    showToast('Please enter a valid amount', 'error');
    return;
  }
  if (type === 'transfer' && account === toAccount) {
    showToast('Source and destination accounts must be different', 'error');
    return;
  }

  // Build transaction object
  const txnPayload = {
    date: new Date(dateVal).toISOString(),
    type,
    amount,
    description,
    account,
    toAccount,
    category,
    subcategory,
    notes
  };

  try {
    if (id) {
      // Edit mode
      await apiCall('PUT', `/api/transactions/${id}`, txnPayload);
      showToast('Transaction updated successfully!');
    } else {
      // Create mode
      await apiCall('POST', '/api/transactions', txnPayload);
      showToast('Transaction added successfully!');
    }
    
    closeTxModal();
    loadData();
  } catch (err) {
    showToast(err.message || 'Operation failed. Check input.', 'error');
  }
});

// Edit & Delete Window Handlers
window.editTransaction = async (id) => {
  const txn = transactions.find(t => t.id === id);
  if (txn) {
    openTxModal(txn);
  }
};

window.deleteTransaction = async (id) => {
  if (!confirm('Are you sure you want to delete this transaction? This will reverse the account balance changes.')) {
    return;
  }
  try {
    await apiCall('DELETE', `/api/transactions/${id}`);
    showToast('Transaction deleted successfully!');
    loadData();
  } catch (err) {
    showToast('Delete operation failed.', 'error');
  }
};

// Global view account history binder
window.viewAccountHistory = viewAccountHistory;
window.selectHistoryAccount = selectHistoryAccount;

// Page Initializer
initAuth();
