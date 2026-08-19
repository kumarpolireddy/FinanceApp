import initSqlJs, { Database } from 'sql.js';

export interface Phase1ValidationReport {
  groups: {
    totalSourceGroups: number;
    activeGroupsCount: number;
    deletedGroupsCount: number;
    importedGroupsCount: number;
    activeGroupsList: { uid: string; name: string; type?: number | null }[];
    deletedGroupsList: { uid: string; name: string; type?: number | null }[];
  };
  accounts: {
    totalSourceAccounts: number;
    deletedAccountsCount: number;
    activeVisibleAccountsCount: number;
    activeHiddenAccountsCount: number;
    importedActiveAccountsCount: number;
    skippedDeletedAccountsCount: number;
    deletedAccountsList: { id: string; uid: string; name: string; zdata: number }[];
    activeVisibleAccountsList: { id: string; uid: string; name: string; zdata: number; groupUid: string; groupName: string; wealthiqAccountId: string; wealthiqCategoryId: string }[];
    activeHiddenAccountsList: { id: string; uid: string; name: string; zdata: number; groupUid: string; groupName: string; wealthiqAccountId: string; wealthiqCategoryId: string }[];
  };
  mappings: {
    validCount: number;
    invalidCount: number;
    unresolvedCount: number;
    accountsInDeletedGroups: { accountId: string; accountUid: string; accountName: string; groupUid: string; groupName: string }[];
    unresolvedGroupMappings: { accountId: string; accountUid: string; accountName: string; groupUid: string }[];
    duplicateAccountNames: { name: string; count: number; instances: { id: string; uid: string; zdata: number; isDeleted: boolean }[] }[];
  };
}

export interface SqliteImportResult {
  success: boolean;
  assetGroups: {
    uid: string;
    name: string;
    attrib: number | null;
    isDeleted: boolean;
  }[];
  accounts: {
    id: string;
    sourceUid: string;
    groupUid?: string;
    groupName?: string;
    name: string;
    type: 'accounts' | 'cash' | 'credit' | 'loan';
    category: string;
    balance: number;
    color: string;
    visible: boolean;
    icon: string;
    isDeleted: boolean;
    isBorrowing?: boolean;
    isLending?: boolean;
  }[];
  categories: {
    id: string;
    sourceUid: string;
    parentUid?: string;
    name: string;
    type: 'income' | 'expense';
    color: string;
    subcategories: string[];
    isDeleted: boolean;
  }[];
  transactions: {
    id: string;
    sourceUid: string;
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense' | 'transfer';
    category: string | null;
    categoryUid?: string;
    subcategory?: string;
    account: string;
    accountUid: string;
    toAccount?: string;
    toAccountUid?: string;
    notes: string;
    status: 'valid' | 'duplicate' | 'error';
    historicalCategoryName?: string;
    historicalAccountName?: string;
    historicalToAccountName?: string;
    isHistoricalOnly?: boolean;
    isHistoricalAccountOnly?: boolean;
  }[];
  budgets?: {
    id: string;
    sourceUid: string;
    categoryName: string;
    categoryUid?: string;
    amount: number;
    month?: string;
  }[];
  orphanedAccounts?: {
    uid: string;
    historicalName: string;
    transactionCount: number;
    lastTransactionDate?: string;
    status: 'POSSIBLY DELETED' | 'UNRESOLVED';
  }[];
  report?: {
    totalSourceAssets: number;
    activeAccountsImported: number;
    deletedAccountsExcluded: number;
    totalSourceGroups: number;
    activeAccountGroups: number;
    deletedAccountGroups: number;
    totalSourceCategories: number;
    activeCategoriesImported: number;
    deletedCategoriesExcluded: number;
    totalTransactionsImported: number;
    transactionsReferencingActiveAccounts: number;
    transactionsReferencingMissingAccounts: number;
    transfersInvolvingMissingAccounts: number;
  };
  phase1Report?: Phase1ValidationReport;
  error?: string;
}

function parseSqliteDate(val: any): string {
  if (val === null || val === undefined || val === '') {
    return new Date().toISOString().slice(0, 10);
  }

  const str = String(val).trim();

  // Pattern 1: YYYY-MM-DD or YYYY/MM/DD (with or without HH:mm:ss)
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const [_, y, m, d] = ymdMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Pattern 2: DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const [_, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Pattern 3: Unix timestamp in seconds or milliseconds
  if (!isNaN(Number(str))) {
    const num = Number(str);
    const ms = num < 10000000000 ? num * 1000 : num;
    const date = new Date(ms);
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  // Pattern 4: JS Date parsing fallback
  const fallbackDate = new Date(str);
  if (!isNaN(fallbackDate.getTime())) {
    return fallbackDate.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

// Dynamic column reader helper to avoid hardcoded positional index errors across Money Manager versions
function createRowReader(columns: string[]) {
  const normalizedCols = columns.map((c) => c.toLowerCase());

  return {
    get: (row: any[], candidates: string[]): any => {
      for (const cand of candidates) {
        const idx = normalizedCols.indexOf(cand.toLowerCase());
        if (idx !== -1 && row[idx] !== undefined && row[idx] !== null) {
          return row[idx];
        }
      }
      return null;
    },
  };
}

let cachedWasmBinary: ArrayBuffer | undefined = undefined;

async function fetchWasmBinary(): Promise<ArrayBuffer | undefined> {
  if (cachedWasmBinary) return cachedWasmBinary;

  const paths = [
    '/sql-wasm.wasm',
    './sql-wasm.wasm',
    'sql-wasm.wasm',
    'https://sql.js.org/dist/sql-wasm.wasm',
  ];

  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (res.ok) {
        cachedWasmBinary = await res.arrayBuffer();
        return cachedWasmBinary;
      }
    } catch (e) {
      console.warn(`Failed to fetch WASM from ${path}:`, e);
    }
  }

  return undefined;
}

// Classify base account type and category ONLY from group name and attribute (NEVER from account name)
export function classifyAccountFromGroup(
  groupName: string,
  attribVal: number | null
): {
  type: 'accounts' | 'cash' | 'credit' | 'loan';
  category: string;
  icon: string;
  color: string;
  isBorrowing?: boolean;
  isLending?: boolean;
} {
  const groupLower = (groupName || '').toLowerCase().trim();
  const categoryName = groupName ? groupName.trim() : 'Unassigned';

  // Attribute 3 = Borrowings / Liabilities / Debt
  if (attribVal === 3 || groupLower.includes('borrow') || groupLower.includes('liability') || groupLower.includes('liabilities') || groupLower.includes('debt')) {
    return {
      type: 'loan',
      category: categoryName,
      icon: '🤝',
      color: '#ef4444',
      isBorrowing: true,
    };
  }

  // Attribute 4 = Lendings / Receivables / Money Lent
  if (attribVal === 4 || groupLower.includes('lend') || groupLower.includes('receivable') || groupLower.includes('assets')) {
    return {
      type: 'loan',
      category: categoryName,
      icon: '💵',
      color: '#10b981',
      isLending: true,
    };
  }

  // Attribute 1 = Credit Cards
  if (attribVal === 1 || groupLower.includes('card') || groupLower.includes('credit')) {
    return {
      type: 'credit',
      category: categoryName,
      icon: '💳',
      color: '#f97316',
    };
  }

  // Cash
  if (groupLower.includes('cash') || groupLower.includes('wallet')) {
    return {
      type: 'cash',
      category: categoryName,
      icon: '💵',
      color: '#22c55e',
    };
  }

  // Loans / EMIs
  if (groupLower.includes('loan') || groupLower.includes('emi')) {
    return {
      type: 'loan',
      category: categoryName,
      icon: '📉',
      color: '#f87171',
    };
  }

  // Default: Main Accounts (Bank Accounts)
  return {
    type: 'accounts',
    category: categoryName,
    icon: '🏦',
    color: '#3b82f6',
  };
}

export async function parseMoneyManagerSqlite(buffer: ArrayBuffer): Promise<SqliteImportResult> {
  try {
    const wasmBinary = await fetchWasmBinary();
    const SQL = await initSqlJs(
      wasmBinary
        ? { wasmBinary }
        : {
            locateFile: (file) => {
              if (typeof window !== 'undefined') {
                return `${window.location.origin}/${file}`;
              }
              return `/${file}`;
            },
          }
    );

    const db: Database = new SQL.Database(new Uint8Array(buffer));

    // Check if INOUTCOME table exists
    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='INOUTCOME'");
    if (!tableCheck.length || !tableCheck[0].values.length) {
      return {
        success: false,
        assetGroups: [],
        transactions: [],
        accounts: [],
        categories: [],
        error:
          'Invalid Money Manager file: "INOUTCOME" table not found. Please upload a valid Money Manager backup file (.sqlite or .db).',
      };
    }

    // 1. Extract Asset Groups (ASSETGROUP) - WHERE IS_DEL = 0
    const extractedAssetGroups: SqliteImportResult['assetGroups'] = [];
    const deletedAssetGroups: SqliteImportResult['assetGroups'] = [];
    const activeAssetGroupMap: Record<string, { uid: string; aid: string; name: string; attrib: number | null; isDeleted: boolean }> = {};
    const deletedAssetGroupMap: Record<string, { uid: string; aid: string; name: string; attrib: number | null; isDeleted: boolean }> = {};
    const allAssetGroupMap: Record<string, { uid: string; aid: string; name: string; attrib: number | null; isDeleted: boolean }> = {};
    let totalGroupCount = 0;

    try {
      const groupRes = db.exec('SELECT * FROM ASSETGROUP');
      if (groupRes.length && groupRes[0].values) {
        totalGroupCount = groupRes[0].values.length;
        const reader = createRowReader(groupRes[0].columns);
        groupRes[0].values.forEach((row) => {
          const aid = String(reader.get(row, ['AID', 'ID', 'UID', 'uid']) || '');
          const name = String(reader.get(row, ['ACC_GROUP_NAME', 'GROUP_NAME', 'NIC_NAME', 'NAME', 'TITLE']) || '').trim();
          const uid = String(reader.get(row, ['uid', 'UID', 'AID', 'ID']) || aid);
          const attribVal = reader.get(row, ['ATTRIB', 'TYPE', 'GROUP_TYPE']);
          const isDelVal = reader.get(row, ['IS_DEL', 'C_IS_DEL', 'DELETED']);
          const isDeleted = isDelVal !== null && Number(isDelVal) !== 0;

          if (name) {
            const groupObj = {
              uid,
              aid,
              name,
              attrib: attribVal !== null ? Number(attribVal) : null,
              isDeleted,
            };
            allAssetGroupMap[uid] = groupObj;
            allAssetGroupMap[aid] = groupObj;

            if (isDeleted) {
              deletedAssetGroupMap[uid] = groupObj;
              deletedAssetGroupMap[aid] = groupObj;
              deletedAssetGroups.push(groupObj);
            } else {
              activeAssetGroupMap[uid] = groupObj;
              activeAssetGroupMap[aid] = groupObj;
              extractedAssetGroups.push(groupObj);
            }
          }
        });
      }
    } catch (e) {
      console.warn('Error reading ASSETGROUP table:', e);
    }

    // 2. Extract Accounts (ASSETS) - Classification: ZDATA = 0 (Active Visible), ZDATA = 3 (Active Hidden), ZDATA = 2 (Deleted)
    const accountMap: Record<string, { uid: string; aid: string; name: string; zdata: number; isDeleted: boolean }> = {};
    const extractedAccounts: SqliteImportResult['accounts'] = [];

    const deletedAccountsList: { id: string; uid: string; name: string; zdata: number }[] = [];
    const activeVisibleAccountsList: { id: string; uid: string; name: string; zdata: number; groupUid: string; groupName: string; wealthiqAccountId: string; wealthiqCategoryId: string }[] = [];
    const activeHiddenAccountsList: { id: string; uid: string; name: string; zdata: number; groupUid: string; groupName: string; wealthiqAccountId: string; wealthiqCategoryId: string }[] = [];

    let validMappingCount = 0;
    let invalidMappingCount = 0;
    let unresolvedMappingCount = 0;
    const accountsInDeletedGroups: { accountId: string; accountUid: string; accountName: string; groupUid: string; groupName: string }[] = [];
    const unresolvedGroupMappings: { accountId: string; accountUid: string; accountName: string; groupUid: string }[] = [];

    const accountNameTracker: Record<string, { id: string; uid: string; zdata: number; isDeleted: boolean }[]> = {};

    let totalSourceAssetsCount = 0;

    try {
      const assetRes = db.exec('SELECT * FROM ASSETS');
      if (assetRes.length && assetRes[0].values) {
        totalSourceAssetsCount = assetRes[0].values.length;
        const reader = createRowReader(assetRes[0].columns);
        assetRes[0].values.forEach((row) => {
          const id = String(reader.get(row, ['ID', 'AID', 'UID', 'uid']) || '');
          const name = String(reader.get(row, ['NIC_NAME', 'NAME', 'TITLE']) || `Account-${id}`).trim();
          const uid = String(reader.get(row, ['uid', 'UID', 'ID', 'AID']) || id);
          const groupUid = String(reader.get(row, ['groupUid', 'GROUP_UID', 'GROUPUID', 'AID']) || '');
          const zdata = reader.get(row, ['ZDATA', 'DATA', 'STATUS']);
          const zdataNum = zdata !== null ? Number(zdata) : 0;

          // Track duplicate names
          const normName = name.toLowerCase();
          if (!accountNameTracker[normName]) accountNameTracker[normName] = [];

          // STRICT ZDATA ACCORDANCE:
          // ZDATA = 0 -> Active + Visible
          // ZDATA = 3 -> Active + Hidden
          // ZDATA = 2 (or non-0/3) -> Deleted
          const isDeletedAccount = zdataNum === 2 || (zdataNum !== 0 && zdataNum !== 3);
          const isVisible = zdataNum === 0;

          accountNameTracker[normName].push({ id, uid, zdata: zdataNum, isDeleted: isDeletedAccount });

          const accInfo = { uid, aid: id, name, zdata: zdataNum, isDeleted: isDeletedAccount };
          accountMap[uid] = accInfo;
          accountMap[id] = accInfo;

          if (isDeletedAccount) {
            deletedAccountsList.push({ id, uid, name, zdata: zdataNum });
          } else {
            // Group Resolution Validation
            let resolvedGroupName = '';
            const activeGroupObj = activeAssetGroupMap[groupUid];
            const deletedGroupObj = deletedAssetGroupMap[groupUid];
            const anyGroupObj = allAssetGroupMap[groupUid];

            if (activeGroupObj) {
              validMappingCount++;
              resolvedGroupName = activeGroupObj.name;
            } else if (deletedGroupObj) {
              invalidMappingCount++;
              resolvedGroupName = deletedGroupObj.name;
              accountsInDeletedGroups.push({
                accountId: id,
                accountUid: uid,
                accountName: name,
                groupUid,
                groupName: deletedGroupObj.name,
              });
            } else {
              unresolvedMappingCount++;
              resolvedGroupName = 'Unresolved Group';
              unresolvedGroupMappings.push({
                accountId: id,
                accountUid: uid,
                accountName: name,
                groupUid,
              });
            }

            const wealthiqAccountId = `mm-acc-${uid}`;
            const wealthiqCategoryId = `acc-cat-${groupUid}`;

            if (isVisible) {
              activeVisibleAccountsList.push({ id, uid, name, zdata: zdataNum, groupUid, groupName: resolvedGroupName, wealthiqAccountId, wealthiqCategoryId });
            } else {
              activeHiddenAccountsList.push({ id, uid, name, zdata: zdataNum, groupUid, groupName: resolvedGroupName, wealthiqAccountId, wealthiqCategoryId });
            }

            const rawBalance = reader.get(row, ['MONEY', 'START_MONEY', 'SURPLUS', 'BALANCE', 'AMOUNT']);
            const balanceNum = rawBalance !== null ? Number(rawBalance) || 0 : 0;
            const attribVal = reader.get(row, ['ATTRIB', 'TYPE', 'ASSET_TYPE', 'CARD_TYPE']);

            const classification = classifyAccountFromGroup(
              resolvedGroupName,
              attribVal !== null ? Number(attribVal) : (anyGroupObj ? anyGroupObj.attrib : null)
            );

            extractedAccounts.push({
              id: `mm-acc-${uid}`,
              sourceUid: uid,
              groupUid,
              groupName: resolvedGroupName || classification.category,
              name,
              type: classification.type,
              category: resolvedGroupName || classification.category,
              balance: balanceNum,
              color: classification.color,
              visible: isVisible,
              icon: classification.icon,
              isDeleted: false,
              isBorrowing: classification.isBorrowing,
              isLending: classification.isLending,
            });
          }
        });
      }
    } catch (e) {
      console.warn('Error reading ASSETS table:', e);
    }

    // Build Duplicate Account Names Report
    const duplicateAccountNames = Object.entries(accountNameTracker)
      .filter(([_, list]) => list.length > 1)
      .map(([normName, list]) => ({
        name: list[0] ? list[0].id : normName,
        count: list.length,
        instances: list,
      }));

    // 3. Extract Categories and Subcategories (ZCATEGORY) - EXCLUDE DELETED CATEGORIES (C_IS_DEL != 0)
    const allCategoriesList: {
      id: string;
      uid: string;
      name: string;
      type: 'income' | 'expense';
      pUid: string;
      isDeleted: boolean;
    }[] = [];
    const categoryByUid: Record<string, (typeof allCategoriesList)[0]> = {};
    let totalSourceCategoryCount = 0;

    try {
      const catRes = db.exec('SELECT * FROM ZCATEGORY');
      if (catRes.length && catRes[0].values) {
        totalSourceCategoryCount = catRes[0].values.length;
        const reader = createRowReader(catRes[0].columns);
        catRes[0].values.forEach((row) => {
          const id = String(reader.get(row, ['ID', 'UID', 'uid']) || '');
          const name = String(reader.get(row, ['NAME', 'NIC_NAME', 'TITLE']) || 'Other').trim();
          const rawType = reader.get(row, ['TYPE', 'C_TYPE', 'DO_TYPE']);
          const type: 'income' | 'expense' = Number(rawType) === 0 ? 'income' : 'expense';
          const uid = String(reader.get(row, ['uid', 'UID', 'ID']) || id);
          const pUid = String(reader.get(row, ['pUid', 'PUID', 'PARENT_UID', 'PARENT_ID']) || '0').trim();

          const isDelVal = reader.get(row, ['C_IS_DEL', 'IS_DEL', 'DELETED']);
          const isDeleted = isDelVal !== null && Number(isDelVal) !== 0;

          const catObj = { id, uid, name, type, pUid, isDeleted };
          allCategoriesList.push(catObj);
          categoryByUid[uid] = catObj;
          categoryByUid[id] = catObj;
        });
      }
    } catch (e) {
      console.warn('Error reading ZCATEGORY table:', e);
    }

    // Build parent categories with subcategories array (STRICT: ONLY active categories)
    const extractedCategoryMap: Record<
      string,
      { id: string; sourceUid: string; parentUid?: string; name: string; type: 'income' | 'expense'; color: string; subcategories: string[]; isDeleted: boolean }
    > = {};

    let deletedCategoriesCount = 0;

    allCategoriesList.forEach((cat) => {
      if (cat.isDeleted) {
        deletedCategoriesCount++;
        return;
      }

      const parent = categoryByUid[cat.pUid];
      if (parent && parent.isDeleted) {
        deletedCategoriesCount++;
        return;
      }

      const isSub = cat.pUid && cat.pUid !== '0' && parent && parent.name !== cat.name;

      if (isSub) {
        const parentKey = parent.uid;
        if (!extractedCategoryMap[parentKey]) {
          extractedCategoryMap[parentKey] = {
            id: `mm-cat-${parent.uid}`,
            sourceUid: parent.uid,
            name: parent.name,
            type: parent.type,
            color: parent.type === 'income' ? '#10b981' : '#ef4444',
            subcategories: [],
            isDeleted: false,
          };
        }
        if (!extractedCategoryMap[parentKey].subcategories.includes(cat.name)) {
          extractedCategoryMap[parentKey].subcategories.push(cat.name);
        }
      } else {
        const catKey = cat.uid;
        if (!extractedCategoryMap[catKey]) {
          extractedCategoryMap[catKey] = {
            id: `mm-cat-${cat.uid}`,
            sourceUid: cat.uid,
            parentUid: cat.pUid && cat.pUid !== '0' ? cat.pUid : undefined,
            name: cat.name,
            type: cat.type,
            color: cat.type === 'income' ? '#10b981' : '#ef4444',
            subcategories: [],
            isDeleted: false,
          };
        }
      }
    });

    const extractedCategories = Object.values(extractedCategoryMap);

    // 4. Extract Transactions (INOUTCOME) & Detect Orphaned Account References
    const extractedTransactions: SqliteImportResult['transactions'] = [];
    const orphanedAccountMap: Record<string, { uid: string; historicalName: string; count: number; lastDate: string }> = {};

    let txReferencingActive = 0;
    let txReferencingMissing = 0;
    let transfersInvolvingMissing = 0;

    try {
      const txRes = db.exec('SELECT * FROM INOUTCOME');

      if (txRes.length && txRes[0].values) {
        const reader = createRowReader(txRes[0].columns);
        txRes[0].values.forEach((row, idx) => {
          const isDel = reader.get(row, ['IS_DEL', 'C_IS_DEL']);
          if (isDel && Number(isDel) !== 0) return;

          const aid = String(reader.get(row, ['AID', 'ID', 'UID', 'uid', 'ACC_ID', 'ACCOUNT_ID', 'A_ID']) || '');
          const uid = String(reader.get(row, ['uid', 'UID', 'ID', 'AID']) || aid);
          const assetUid = String(reader.get(row, ['assetUid', 'ASSET_UID', 'ASSETUID', 'ASSET_ID', 'AID', 'ACC_ID', 'A_ID', 'ACCOUNT_ID']) || aid);
          const ctgUid = String(reader.get(row, ['ctgUid', 'CTG_UID', 'CTGUID', 'C_UID', 'CATEGORY_ID', 'CAT_ID']) || '');
          const toAssetUid = String(reader.get(row, ['toAssetUid', 'TO_ASSET_UID', 'TOASSETUID', 'TO_ASSET_ID', 'TO_AID', 'TO_ACC_ID']) || '');
          const content = String(reader.get(row, ['ZCONTENT', 'CONTENT', 'MEMO', 'DESCRIPTION', 'NOTE']) || '').trim();
          const rawAssetNic = String(reader.get(row, ['ASSET_NIC', 'ACCOUNT_NAME', 'NIC_NAME', 'ACC_NAME', 'ASSET_NAME']) || '').trim();
          const rawWdate = reader.get(row, ['WDATE', 'DATE', 'ZDATE']);
          const doType = String(reader.get(row, ['DO_TYPE', 'TYPE', 'TYPE_DO', 'ZTYPE', 'ZDO_TYPE']) || '1').toLowerCase().trim();
          const zmoney = Number(reader.get(row, ['ZMONEY', 'MONEY', 'AMOUNT', 'IN_ZMONEY', 'ZAMOUNT', 'OUT_ZMONEY'])) || 0;

          // Skip Money Manager's mirror twin transfer entries (DO_TYPE = 4) to prevent duplicate transfers and balance zeroing
          if (doType === '4') return;

          let type: 'income' | 'expense' | 'transfer' = 'expense';
          if (doType === '0' || doType.includes('income')) {
            type = 'income';
          } else if (['2', '3', '5'].includes(doType) || doType.includes('transfer')) {
            type = 'transfer';
          }

          const accObj = accountMap[assetUid] || accountMap[aid];
          const toAccObj = accountMap[toAssetUid];

          const isAccActive = accObj && !accObj.isDeleted;
          const isToAccActive = toAccObj && !toAccObj.isDeleted;
          
          let accountName = isAccActive ? accObj.name : '';
          let toAccountName = isToAccActive ? toAccObj.name : '';

          let historicalAccountName: string | undefined = undefined;
          let historicalToAccountName: string | undefined = undefined;
          let isHistoricalAccountOnly = false;

          const dateStr = parseSqliteDate(rawWdate);

          // Detect Deleted / Missing assetUid
          if (!isAccActive) {
            txReferencingMissing++;
            isHistoricalAccountOnly = true;
            historicalAccountName = accObj ? `${accObj.name} (Deleted)` : (rawAssetNic || `Deleted Account (UID: ${assetUid})`);
            accountName = historicalAccountName;

            if (assetUid) {
              if (!orphanedAccountMap[assetUid]) {
                orphanedAccountMap[assetUid] = {
                  uid: assetUid,
                  historicalName: historicalAccountName,
                  count: 1,
                  lastDate: dateStr,
                };
              } else {
                orphanedAccountMap[assetUid].count++;
                if (dateStr > orphanedAccountMap[assetUid].lastDate) {
                  orphanedAccountMap[assetUid].lastDate = dateStr;
                }
              }
            }
          } else {
            txReferencingActive++;
          }

          // Detect Deleted / Missing toAssetUid for transfers
          if (type === 'transfer' && !isToAccActive) {
            transfersInvolvingMissing++;
            if (!isAccActive) {
              isHistoricalAccountOnly = true;
            }
            const cleanToName = toAccObj ? toAccObj.name.trim() : '';
            historicalToAccountName = cleanToName ? `${cleanToName} (Deleted)` : `Deleted Destination Account (UID: ${toAssetUid})`;
            toAccountName = historicalToAccountName;

            if (toAssetUid) {
              if (!orphanedAccountMap[toAssetUid]) {
                orphanedAccountMap[toAssetUid] = {
                  uid: toAssetUid,
                  historicalName: historicalToAccountName,
                  count: 1,
                  lastDate: dateStr,
                };
              } else {
                orphanedAccountMap[toAssetUid].count++;
              }
            }
          }

          // Resolve Category & Subcategory from ctgUid faithfully
          let categoryName: string | null = null;
          let subcategoryName: string | undefined = undefined;
          let historicalCategoryName: string | undefined = undefined;
          let isHistoricalOnly = false;

          if (type !== 'transfer') {
            const rawCat = categoryByUid[ctgUid];
            if (rawCat) {
              const parentCat = categoryByUid[rawCat.pUid];
              const resolvedName = parentCat && rawCat.pUid !== '0' && parentCat.name !== rawCat.name ? parentCat.name : rawCat.name;
              const resolvedSubName = parentCat && rawCat.pUid !== '0' && parentCat.name !== rawCat.name ? rawCat.name : undefined;

              if (rawCat.isDeleted || (parentCat && parentCat.isDeleted)) {
                categoryName = null;
                historicalCategoryName = resolvedSubName ? `${resolvedName} → ${resolvedSubName}` : resolvedName;
                isHistoricalOnly = true;
              } else {
                categoryName = resolvedName;
                subcategoryName = resolvedSubName;
              }
            } else {
              categoryName = null;
              historicalCategoryName = 'Historical Unmapped';
              isHistoricalOnly = true;
            }
          }

          // Direct User Mapping Rule: ZCONTENT is Note, ZDATA is Description (blank if not present)
          const zdataRaw = String(reader.get(row, ['ZDATA', 'NOTE_EXTRA', 'MEMO_EXTRA']) || '').trim();
          const cleanZdata = zdataRaw && zdataRaw !== '..' ? zdataRaw : '';

          // 1. ZDATA is Description (blank if not present)
          const description = cleanZdata;

          // 2. ZCONTENT is Note
          const notes = content;

          extractedTransactions.push({
            id: `mm-tx-${uid}-${idx}`,
            sourceUid: uid,
            date: dateStr,
            description,
            amount: Math.abs(zmoney),
            type,
            category: categoryName,
            categoryUid: ctgUid,
            subcategory: subcategoryName,
            account: accountName,
            accountUid: assetUid || aid,
            toAccount: type === 'transfer' ? toAccountName : undefined,
            toAccountUid: type === 'transfer' ? toAssetUid : undefined,
            notes: notes || '',
            status: 'valid',
            historicalCategoryName,
            historicalAccountName,
            historicalToAccountName,
            isHistoricalOnly,
            isHistoricalAccountOnly,
          });
        });
      }
    } catch (e) {
      console.warn('Error reading INOUTCOME table:', e);
    }

    // 5. Extract Budgets (BUDGET / ASSETBUDGET / ZBUDGET) if Table Exists
    const extractedBudgets: SqliteImportResult['budgets'] = [];
    try {
      const budgetTableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('BUDGET', 'ASSETBUDGET', 'ZBUDGET')");
      if (budgetTableCheck.length && budgetTableCheck[0].values.length) {
        const budgetTableName = String(budgetTableCheck[0].values[0][0]);
        const budgetRes = db.exec(`SELECT * FROM ${budgetTableName}`);
        if (budgetRes.length && budgetRes[0].values) {
          const reader = createRowReader(budgetRes[0].columns);
          budgetRes[0].values.forEach((row, idx) => {
            const uid = String(reader.get(row, ['uid', 'UID', 'ID']) || `budget-${idx}`);
            const ctgUid = String(reader.get(row, ['ctgUid', 'CTG_UID', 'C_UID', 'CATEGORY_ID']) || '');
            const amountVal = Number(reader.get(row, ['MONEY', 'AMOUNT', 'BUDGET_MONEY'])) || 0;
            const monthVal = String(reader.get(row, ['MONTH', 'WDATE', 'DATE']) || '');

            const catObj = categoryByUid[ctgUid];
            if (catObj && !catObj.isDeleted && amountVal > 0) {
              extractedBudgets.push({
                id: `mm-budget-${uid}`,
                sourceUid: uid,
                categoryName: catObj.name,
                categoryUid: ctgUid,
                amount: amountVal,
                month: monthVal,
              });
            }
          });
        }
      }
    } catch (e) {
      console.warn('Error reading budget tables:', e);
    }

    db.close();

    const orphanedAccounts = Object.values(orphanedAccountMap).map((o) => ({
      uid: o.uid,
      historicalName: o.historicalName,
      transactionCount: o.count,
      lastTransactionDate: o.lastDate,
      status: 'POSSIBLY DELETED' as const,
    }));

    const phase1Report: Phase1ValidationReport = {
      groups: {
        totalSourceGroups: totalGroupCount,
        activeGroupsCount: extractedAssetGroups.length,
        deletedGroupsCount: deletedAssetGroups.length,
        importedGroupsCount: extractedAssetGroups.length,
        activeGroupsList: extractedAssetGroups.map((g) => ({ uid: g.uid, name: g.name, type: g.attrib })),
        deletedGroupsList: deletedAssetGroups.map((g) => ({ uid: g.uid, name: g.name, type: g.attrib })),
      },
      accounts: {
        totalSourceAccounts: totalSourceAssetsCount,
        deletedAccountsCount: deletedAccountsList.length,
        activeVisibleAccountsCount: activeVisibleAccountsList.length,
        activeHiddenAccountsCount: activeHiddenAccountsList.length,
        importedActiveAccountsCount: extractedAccounts.length,
        skippedDeletedAccountsCount: deletedAccountsList.length,
        deletedAccountsList,
        activeVisibleAccountsList,
        activeHiddenAccountsList,
      },
      mappings: {
        validCount: validMappingCount,
        invalidCount: invalidMappingCount,
        unresolvedCount: unresolvedMappingCount,
        accountsInDeletedGroups,
        unresolvedGroupMappings,
        duplicateAccountNames,
      },
    };

    const report = {
      totalSourceAssets: totalSourceAssetsCount,
      activeAccountsImported: extractedAccounts.length,
      deletedAccountsExcluded: deletedAccountsList.length,
      totalSourceGroups: totalGroupCount,
      activeAccountGroups: extractedAssetGroups.length,
      deletedAccountGroups: deletedAssetGroups.length,
      totalSourceCategories: totalSourceCategoryCount,
      activeCategoriesImported: extractedCategories.length,
      deletedCategoriesExcluded: deletedCategoriesCount,
      totalTransactionsImported: extractedTransactions.length,
      transactionsReferencingActiveAccounts: txReferencingActive,
      transactionsReferencingMissingAccounts: txReferencingMissing,
      transfersInvolvingMissingAccounts: transfersInvolvingMissing,
    };

    return {
      success: true,
      assetGroups: extractedAssetGroups,
      transactions: extractedTransactions,
      accounts: extractedAccounts,
      categories: extractedCategories,
      budgets: extractedBudgets,
      orphanedAccounts,
      report,
      phase1Report,
    };
  } catch (err: any) {
    console.error('Error parsing Money Manager SQLite file:', err);
    return {
      success: false,
      assetGroups: [],
      transactions: [],
      accounts: [],
      categories: [],
      error: `Failed to parse SQLite database: ${err?.message || err}`,
    };
  }
}
