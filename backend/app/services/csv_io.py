"""CSV import/export for transactions.

Format (header row required, column order free, names case-insensitive):
    date, type, amount, account, to_account, category, description, payee, tags, currency

- date: YYYY-MM-DD or DD.MM.YYYY
- type: income | expense | transfer. If empty, the sign of `amount` decides
  (negative = expense, positive = income); otherwise amount must be positive.
- account / to_account / category: matched by name (case-insensitive). Unknown
  names reject the row; nothing is created implicitly.
- tags: separated by "|".
- currency: optional; when present it must equal the account's currency.

Every row ends up in exactly one bucket: imported, rejected (with reason) or duplicate.
A row is a duplicate when an identical transaction (date, type, amount, accounts,
category, description, payee) already exists. Identical rows within one file are
counted, so re-importing the same file never creates copies, while two genuinely
identical purchases in a fresh file are both imported.
"""

import csv
import io
from collections import Counter
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import ValidationFailed
from app.models import Account, Category, Transaction
from app.schemas.finance import TransactionCreate
from app.services.money import parse_amount
from app.services.transactions import TxFilter, _validate, iter_filtered

COLUMNS = ["date", "type", "amount", "currency", "account", "to_account", "category", "description", "payee", "tags"]
REQUIRED = {"date", "amount", "account"}
MAX_BYTES = 5 * 1024 * 1024
MAX_ROWS = 20000
_FORMULA_PREFIX = ("=", "+", "-", "@", "\t", "\r")


def _safe_cell(value: str) -> str:
    """Neutralise spreadsheet formula injection in free-text cells."""
    return "'" + value if value and value.startswith(_FORMULA_PREFIX) else value


def _unsafe_cell(value: str) -> str:
    return value[1:] if len(value) > 1 and value[0] == "'" and value[1] in "=+-@\t\r" else value


def _parse_date(raw: str) -> date:
    raw = raw.strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"'{raw}' is not a date (use YYYY-MM-DD or DD.MM.YYYY)")


def _dup_key(tx_type, amount, d, account_id, to_account_id, category_id, description, payee) -> tuple:
    return (tx_type, str(amount), d, account_id, to_account_id, category_id,
            (description or "").strip().lower(), (payee or "").strip().lower())


def decode(content: bytes) -> str:
    if len(content) > MAX_BYTES:
        raise ValidationFailed("CSV file is larger than 5 MB")
    for encoding in ("utf-8-sig", "cp1251"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValidationFailed("Could not decode the file; save it as UTF-8")


def import_csv(db: Session, text: str, *, dry_run: bool) -> dict:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    if not reader.fieldnames:
        raise ValidationFailed("The file is empty or has no header row")
    header = {h: (h or "").strip().lower() for h in reader.fieldnames}
    missing = REQUIRED - set(header.values())
    if missing:
        raise ValidationFailed(f"Missing required column(s): {', '.join(sorted(missing))}",
                               details={"expected": COLUMNS})

    accounts = {a.name.lower(): a for a in db.scalars(select(Account))}
    categories: dict[tuple[str, str], Category] = {(c.kind, c.name.lower()): c for c in db.scalars(select(Category))}

    parsed: list[tuple[int, dict, TransactionCreate]] = []
    rejected, duplicates = [], []
    total = 0
    for idx, raw_row in enumerate(reader, start=2):  # row 1 is the header
        total += 1
        if total > MAX_ROWS:
            raise ValidationFailed(f"Too many rows (limit {MAX_ROWS})")
        row = {header[k]: (v or "").strip() for k, v in raw_row.items() if k is not None}
        raw = {k: row.get(k, "") for k in COLUMNS if row.get(k)}
        if not any(row.values()):
            total -= 1
            continue
        try:
            d = _parse_date(row.get("date", ""))
            amount = parse_amount(row.get("amount", ""))
            tx_type = row.get("type", "").lower()
            if not tx_type:
                if amount == 0:
                    raise ValueError("amount must not be zero")
                tx_type = "expense" if amount < 0 else "income"
                amount = abs(amount)
            elif tx_type not in ("income", "expense", "transfer"):
                raise ValueError(f"unknown type '{row['type']}'")
            if amount <= 0:
                raise ValueError("amount must be greater than zero when a type is given")
            account = accounts.get(row.get("account", "").lower())
            if account is None:
                raise ValueError(f"unknown account '{row.get('account', '')}'")
            if row.get("currency") and row["currency"].upper() != account.currency:
                raise ValueError(f"currency {row['currency'].upper()} does not match account currency "
                                 f"{account.currency}")
            to_account_id = category_id = None
            if tx_type == "transfer":
                dst = accounts.get(row.get("to_account", "").lower())
                if dst is None:
                    raise ValueError(f"unknown destination account '{row.get('to_account', '')}'")
                to_account_id = dst.id
            else:
                if row.get("to_account"):
                    raise ValueError("to_account is only allowed for transfers")
                cat = categories.get((tx_type, row.get("category", "").lower()))
                if cat is None:
                    raise ValueError(f"unknown {tx_type} category '{row.get('category', '')}'")
                category_id = cat.id
            tags = [t.strip().lower() for t in row.get("tags", "").split("|") if t.strip()]
            data = TransactionCreate(
                type=tx_type, amount=amount, date=d, account_id=account.id, to_account_id=to_account_id,
                category_id=category_id, description=_unsafe_cell(row.get("description", ""))[:255],
                payee=_unsafe_cell(row.get("payee", ""))[:120] or None, tags=tags[:20],
            )
            _validate(db, type=data.type, account_id=data.account_id, to_account_id=data.to_account_id,
                      category_id=data.category_id, tx_date=data.date)
        except ValidationFailed as exc:
            rejected.append({"row": idx, "reason": exc.message, "raw": raw})
            continue
        except ValueError as exc:  # includes pydantic.ValidationError
            reason = str(exc).splitlines()[0] if not hasattr(exc, "errors") else "; ".join(
                e["msg"] for e in exc.errors())  # type: ignore[attr-defined]
            rejected.append({"row": idx, "reason": reason, "raw": raw})
            continue
        parsed.append((idx, raw, data))

    # Duplicate detection against existing data (count-aware).
    existing: Counter = Counter()
    if parsed:
        lo, hi = min(p[2].date for p in parsed), max(p[2].date for p in parsed)
        for t in db.scalars(select(Transaction).where(Transaction.date >= lo, Transaction.date <= hi)).unique():
            existing[_dup_key(t.type, t.amount, t.date, t.account_id, t.to_account_id, t.category_id,
                              t.description, t.payee)] += 1

    to_insert = []
    for idx, raw, data in parsed:
        key = _dup_key(data.type, data.amount, data.date, data.account_id, data.to_account_id, data.category_id,
                       data.description, data.payee)
        if existing[key] > 0:
            existing[key] -= 1
            duplicates.append({"row": idx, "reason": "matches an existing transaction", "raw": raw})
        else:
            to_insert.append(data)

    if not dry_run and to_insert:
        for data in to_insert:
            db.add(Transaction(
                type=data.type, amount=data.amount, date=data.date, account_id=data.account_id,
                to_account_id=data.to_account_id, category_id=data.category_id, description=data.description,
                payee=data.payee, tags=data.tags,
            ))
        db.commit()
    return {"dry_run": dry_run, "total_rows": total, "imported": len(to_insert), "rejected": rejected,
            "duplicates": duplicates}


def export_csv(db: Session, f: TxFilter) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(COLUMNS)
    for t in iter_filtered(db, f):
        writer.writerow([
            t.date.isoformat(), t.type, f"{t.amount:.2f}", t.account.currency, t.account.name,
            t.to_account.name if t.to_account else "", t.category.name if t.category else "",
            _safe_cell(t.description or ""), _safe_cell(t.payee or ""), "|".join(t.tags or []),
        ])
    return buf.getvalue()


def has_transactions(db: Session) -> bool:
    return bool(db.scalar(select(func.count()).select_from(Transaction)))
