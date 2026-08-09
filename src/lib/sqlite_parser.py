import sqlite3
import json
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

def parse_sqlite(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. Accounts
    cursor.execute("SELECT ID, NIC_NAME, uid, groupUid FROM ASSETS")
    assets = cursor.fetchall()
    accounts_list = []
    account_map = {}
    for a in assets:
        aid, name, uid, group = a
        cleaned_name = (name or f"Account-{aid}").strip()
        account_map[str(uid)] = cleaned_name
        account_map[str(aid)] = cleaned_name
        
        acc_type = "bank"
        lower_name = cleaned_name.lower()
        if "loan" in lower_name or "friend" in lower_name or "taken" in lower_name:
            acc_type = "loan"
        elif "credit" in lower_name or "card" in lower_name:
            acc_type = "credit_card"
        elif "cash" in lower_name:
            acc_type = "cash"

        accounts_list.append({
            "id": str(uid),
            "name": cleaned_name,
            "type": acc_type,
            "balance": 0,
            "color": "#3b82f6",
            "visible": True,
        })

    # 2. Categories
    cursor.execute("SELECT ID, NAME, TYPE, uid FROM ZCATEGORY WHERE C_IS_DEL IS NULL OR C_IS_DEL=0")
    categories_list = []
    category_map = {}
    for c in cursor.fetchall():
        cid, name, ctype, uid = c
        cleaned_name = (name or 'Other').strip()
        category_map[str(uid)] = cleaned_name
        category_map[str(cid)] = cleaned_name
        categories_list.append({
            "id": str(uid),
            "name": cleaned_name,
            "type": "income" if ctype == 0 else "expense",
            "color": "#10b981" if ctype == 0 else "#ef4444"
        })

    # 3. Transactions
    cursor.execute("SELECT AID, uid, assetUid, ctgUid, toAssetUid, ZCONTENT, WDATE, DO_TYPE, ZMONEY, IN_ZMONEY FROM INOUTCOME WHERE IS_DEL=0 OR IS_DEL IS NULL ORDER BY WDATE DESC")
    tx_rows = cursor.fetchall()
    transactions_list = []

    type_map = {'0': 'income', '1': 'expense', '2': 'transfer', '3': 'transfer', '4': 'transfer'}

    for r in tx_rows:
        aid, uid, asset_uid, ctg_uid, to_asset_uid, content, wdate, do_type, zmoney, in_zmoney = r
        
        tx_type = type_map.get(str(do_type), 'expense')
        amount = float(zmoney) if zmoney else (float(in_zmoney) if in_zmoney else 0.0)
        
        acc_name = account_map.get(str(asset_uid), 'Cash')
        to_acc_name = account_map.get(str(to_asset_uid), '')
        ctg_name = category_map.get(str(ctg_uid), 'Other')

        date_str = wdate if wdate and len(wdate) == 10 else "2025-11-15"

        transactions_list.append({
            "id": str(uid or aid),
            "date": date_str,
            "description": (content or ctg_name or 'Imported Transaction').strip(),
            "amount": amount,
            "type": tx_type,
            "category": None if tx_type == 'transfer' else ctg_name,
            "account": acc_name,
            "toAccount": to_acc_name if tx_type == 'transfer' else None,
            "notes": (content or '').strip(),
            "status": "valid"
        })

    return {
        "accounts": accounts_list,
        "categories": categories_list,
        "transactions": transactions_list
    }

if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else r'E:\VS_Code\FinanceApp\money_android.sqlite'
    res = parse_sqlite(path)
    print(json.dumps(res, ensure_ascii=False))
