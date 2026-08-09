import initSqlJs, { Database } from 'sql.js';

export interface SqliteImportResult {
  success: boolean;
  transactions: {
    id: string;
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense' | 'transfer';
    category: string | null;
    subcategory?: string;
    account: string;
    toAccount?: string;
    notes: string;
    status: 'valid' | 'duplicate' | 'error';
  }[];
  accounts: {
    id: string;
    name: string;
    type: 'accounts' | 'cash' | 'credit' | 'loan';
    balance: number;
    color: string;
    visible: boolean;
    icon: string;
  }[];
  categories: {
    id: string;
    name: string;
    type: 'income' | 'expense';
    color: string;
    subcategories: string[];
  }[];
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
        transactions: [],
        accounts: [],
        categories: [],
        error:
          'Invalid Money Manager file: "INOUTCOME" table not found. Please upload a valid Money Manager backup file (.sqlite or .db).',
      };
    }

    // 1. Extract Asset Groups (ASSETGROUP)
    const assetGroupMap: Record<string, string> = {};
    try {
      const groupRes = db.exec('SELECT AID, NIC_NAME, uid FROM ASSETGROUP');
      if (groupRes.length && groupRes[0].values) {
        groupRes[0].values.forEach((row) => {
          const aid = String(row[0]);
          const name = String(row[1] || '').trim();
          const uid = String(row[2] || aid);
          assetGroupMap[uid] = name;
          assetGroupMap[aid] = name;
        });
      }
    } catch (e) {
      console.warn('Error reading ASSETGROUP table:', e);
    }

    // 2. Extract Accounts (ASSETS)
    const accountMap: Record<string, string> = {};
    const extractedAccounts: SqliteImportResult['accounts'] = [];

    try {
      const assetRes = db.exec('SELECT ID, NIC_NAME, uid, groupUid FROM ASSETS');
      if (assetRes.length && assetRes[0].values) {
        assetRes[0].values.forEach((row) => {
          const id = String(row[0]);
          const name = String(row[1] || `Account-${id}`).trim();
          const uid = String(row[2] || id);
          const groupUid = String(row[3] || '');
          const groupName = (assetGroupMap[groupUid] || '').toLowerCase();

          accountMap[uid] = name;
          accountMap[id] = name;

          const lower = name.toLowerCase();
          let accType: 'accounts' | 'cash' | 'credit' | 'loan' = 'accounts';
          let icon = '🏦';
          let color = '#3b82f6';

          if (
            groupName.includes('debt') ||
            groupName.includes('loan') ||
            lower.includes('loan') ||
            lower.includes('friend') ||
            lower.includes('taken')
          ) {
            accType = 'loan';
            icon = '📉';
            color = '#ef4444';
          } else if (groupName.includes('card') || lower.includes('credit') || lower.includes('card')) {
            accType = 'credit';
            icon = '💳';
            color = '#f97316';
          } else if (
            groupName.includes('cash') ||
            lower.includes('cash') ||
            lower.includes('wallet') ||
            lower.includes('hand')
          ) {
            accType = 'cash';
            icon = '💵';
            color = '#10b981';
          }

          extractedAccounts.push({
            id: `mm-acc-${uid}`,
            name,
            type: accType,
            balance: 0,
            color,
            visible: true,
            icon,
          });
        });
      }
    } catch (e) {
      console.warn('Error reading ASSETS table:', e);
    }

    // 3. Extract Categories and Subcategories (ZCATEGORY)
    const uniqueCategoriesList: {
      id: string;
      uid: string;
      name: string;
      type: 'income' | 'expense';
      pUid: string;
    }[] = [];
    const categoryByUid: Record<string, (typeof uniqueCategoriesList)[0]> = {};

    try {
      const catRes = db.exec(
        'SELECT ID, NAME, TYPE, uid, pUid FROM ZCATEGORY WHERE C_IS_DEL IS NULL OR C_IS_DEL=0'
      );
      if (catRes.length && catRes[0].values) {
        catRes[0].values.forEach((row) => {
          const id = String(row[0]);
          const name = String(row[1] || 'Other').trim();
          const type: 'income' | 'expense' = Number(row[2]) === 0 ? 'income' : 'expense';
          const uid = String(row[3] || id);
          const pUid = String(row[4] || '0').trim();

          const catObj = { id, uid, name, type, pUid };
          uniqueCategoriesList.push(catObj);
          categoryByUid[uid] = catObj;
          categoryByUid[id] = catObj;
        });
      }
    } catch (e) {
      console.warn('Error reading ZCATEGORY table:', e);
    }

    // Build parent categories with subcategories array
    const extractedCategoryMap: Record<
      string,
      { id: string; name: string; type: 'income' | 'expense'; color: string; subcategories: string[] }
    > = {};

    uniqueCategoriesList.forEach((cat) => {
      const parent = categoryByUid[cat.pUid];
      if (cat.pUid && cat.pUid !== '0' && parent && parent.name !== cat.name) {
        // Subcategory: Add to parent category's subcategories list
        if (!extractedCategoryMap[parent.name]) {
          extractedCategoryMap[parent.name] = {
            id: `mm-cat-${parent.uid}`,
            name: parent.name,
            type: parent.type,
            color: parent.type === 'income' ? '#10b981' : '#ef4444',
            subcategories: [],
          };
        }
        if (!extractedCategoryMap[parent.name].subcategories.includes(cat.name)) {
          extractedCategoryMap[parent.name].subcategories.push(cat.name);
        }
      } else {
        // Parent category
        if (!extractedCategoryMap[cat.name]) {
          extractedCategoryMap[cat.name] = {
            id: `mm-cat-${cat.uid}`,
            name: cat.name,
            type: cat.type,
            color: cat.type === 'income' ? '#10b981' : '#ef4444',
            subcategories: [],
          };
        }
      }
    });

    const extractedCategories = Object.values(extractedCategoryMap);

    // 4. Extract Transactions (INOUTCOME)
    const extractedTransactions: SqliteImportResult['transactions'] = [];
    const txRes = db.exec(
      'SELECT AID, uid, assetUid, ctgUid, toAssetUid, ZCONTENT, WDATE, DO_TYPE, ZMONEY, IN_ZMONEY FROM INOUTCOME WHERE IS_DEL=0 OR IS_DEL IS NULL ORDER BY WDATE DESC'
    );

    if (txRes.length && txRes[0].values) {
      txRes[0].values.forEach((row, idx) => {
        const aid = String(row[0]);
        const uid = String(row[1] || aid);
        const assetUid = String(row[2] || '');
        const ctgUid = String(row[3] || '');
        const toAssetUid = String(row[4] || '');
        const content = String(row[5] || '').trim();
        const rawWdate = row[6];
        const doType = String(row[7]);
        const zmoney = Number(row[8]) || Number(row[9]) || 0;

        let type: 'income' | 'expense' | 'transfer' = 'expense';
        if (doType === '0') {
          type = 'income';
        } else if (['2', '3', '4'].includes(doType)) {
          type = 'transfer';
        }

        const accountName = accountMap[assetUid] || 'Cash';
        const toAccountName = accountMap[toAssetUid] || '';

        // Resolve Category and Subcategory from ctgUid
        let categoryName: string | null = null;
        let subcategoryName: string | undefined = undefined;

        if (type !== 'transfer') {
          const rawCat = categoryByUid[ctgUid];
          if (rawCat) {
            const parentCat = categoryByUid[rawCat.pUid];
            if (rawCat.pUid && rawCat.pUid !== '0' && parentCat && parentCat.name !== rawCat.name) {
              categoryName = parentCat.name;
              subcategoryName = rawCat.name;
            } else {
              categoryName = rawCat.name;
            }
          } else {
            categoryName = 'Other';
          }
        }

        const dateStr = parseSqliteDate(rawWdate);

        extractedTransactions.push({
          id: `mm-tx-${uid}-${idx}`,
          date: dateStr,
          description: content || subcategoryName || categoryName || 'Imported Transaction',
          amount: Math.abs(zmoney),
          type,
          category: categoryName,
          subcategory: subcategoryName,
          account: accountName,
          toAccount: type === 'transfer' ? toAccountName : undefined,
          notes: '',
          status: 'valid',
        });
      });
    }

    db.close();

    return {
      success: true,
      transactions: extractedTransactions,
      accounts: extractedAccounts,
      categories: extractedCategories,
    };
  } catch (err: any) {
    console.error('Error parsing Money Manager SQLite file:', err);
    return {
      success: false,
      transactions: [],
      accounts: [],
      categories: [],
      error: `Failed to parse SQLite database: ${err?.message || err}`,
    };
  }
}
