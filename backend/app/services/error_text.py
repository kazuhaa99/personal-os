"""Localised error messages (ru, ko) for everything the API reports to a person.

Services keep raising plain English (`raise ValidationFailed(f"Account {id} not found")`);
the exception handlers translate on the way out using the request's Accept-Language.
Keys are the English templates exactly as written in the code, with f-string parts as
`{expr}` placeholders; a captured value that is a known enum word (income, Account, …)
is translated too. `tests/test_error_text.py` fails if a raised message has no entry.
"""

import re
from functools import lru_cache

# English enum-ish words that appear inside messages, per language.
VALUES: dict[str, dict[str, str]] = {
    "ru": {
        "income": "доходов", "expense": "расходов", "transfer": "переводов",
        "Account": "Счёт", "Destination account": "Счёт зачисления",
        "paid off": "погашена", "cancelled": "отменена", "paused": "приостановлена", "active": "активна",
        "Category": "Категория", "Goal": "Цель", "Project": "Проект", "Task": "Задача", "Habit": "Привычка",
        "Transaction": "Операция", "RecurringRule": "Регулярный платёж", "InstallmentPlan": "Рассрочка",
        "InstallmentPayment": "Платёж по рассрочке", "IncomeSource": "Источник дохода", "Milestone": "Этап",
    },
    "ko": {
        "income": "수입", "expense": "지출", "transfer": "이체",
        "Account": "계좌", "Destination account": "입금 계좌",
        "paid off": "상환 완료", "cancelled": "취소됨", "paused": "일시 중지됨", "active": "진행 중",
        "Category": "카테고리", "Goal": "목표", "Project": "프로젝트", "Task": "할 일", "Habit": "습관",
        "Transaction": "거래", "RecurringRule": "정기 결제", "InstallmentPlan": "할부",
        "InstallmentPayment": "할부 납부", "IncomeSource": "수입원", "Milestone": "단계",
    },
}

# template -> (ru, ko)
MESSAGES: dict[str, tuple[str, str]] = {
    # --- auth & account
    "Too many attempts. Try again in a few minutes.": ("Слишком много попыток. Попробуйте через несколько минут.", "시도 횟수가 너무 많아요. 몇 분 후 다시 시도해 주세요."),
    "Confirm your email to sign in. We sent a code to {user.email}.": ("Подтвердите почту, чтобы войти. Мы отправили код на {user.email}.", "로그인하려면 이메일을 인증해 주세요. {user.email}(으)로 코드를 보냈어요."),
    "Registration is closed": ("Регистрация закрыта", "회원가입이 닫혀 있어요"),
    "Wrong code": ("Неверный код", "코드가 올바르지 않아요"),
    "This email is already confirmed": ("Эта почта уже подтверждена", "이미 인증된 이메일이에요"),
    "Current password is wrong": ("Текущий пароль неверный", "현재 비밀번호가 올바르지 않아요"),
    "An account with this email already exists": ("Аккаунт с такой почтой уже существует", "이 이메일로 가입된 계정이 이미 있어요"),
    "There is no email change to confirm": ("Нет смены почты, которую нужно подтвердить", "인증할 이메일 변경 요청이 없어요"),
    "Sign in required": ("Нужно войти в аккаунт", "로그인이 필요해요"),
    "Password must be at least 8 characters": ("Пароль должен быть не короче 8 символов", "비밀번호는 8자 이상이어야 해요"),
    "Password is too long": ("Пароль слишком длинный", "비밀번호가 너무 길어요"),
    "Username: 3–32 characters, latin letters, digits, “_” or “.”": ("Логин: 3–32 символа — латинские буквы, цифры, «_» или «.»", "아이디: 3–32자, 영문자, 숫자, “_” 또는 “.”"),
    "Enter a valid email address": ("Введите корректный адрес почты", "올바른 이메일 주소를 입력해 주세요"),
    "This username is taken": ("Этот логин уже занят", "이미 사용 중인 아이디예요"),
    "Email sending is not configured on the server, so new accounts can't be confirmed": ("На сервере не настроена отправка писем, поэтому новые аккаунты нельзя подтвердить", "서버에 메일 발송이 설정되지 않아 새 계정을 인증할 수 없어요"),
    "Wrong username or password": ("Неверный логин или пароль", "아이디 또는 비밀번호가 올바르지 않아요"),
    "The only account can't be deleted": ("Единственный аккаунт удалить нельзя", "유일한 계정은 삭제할 수 없어요"),
    "Add an email address first": ("Сначала добавьте адрес почты", "먼저 이메일 주소를 추가해 주세요"),
    "Please wait a minute before requesting another code": ("Подождите минуту, прежде чем запросить новый код", "새 코드를 요청하기 전에 1분만 기다려 주세요"),
    "The code has expired. Request a new one.": ("Срок действия кода истёк. Запросите новый.", "코드가 만료됐어요. 새 코드를 요청해 주세요."),
    "Too many wrong codes. Request a new one.": ("Слишком много неверных кодов. Запросите новый.", "잘못된 코드를 너무 많이 입력했어요. 새 코드를 요청해 주세요."),
    "Email sending is not configured on the server (POS_SMTP_PASSWORD)": ("На сервере не настроена отправка писем (POS_SMTP_PASSWORD)", "서버에 메일 발송이 설정되지 않았어요 (POS_SMTP_PASSWORD)"),
    "Could not send the email. Check the SMTP settings and try again.": ("Не удалось отправить письмо. Проверьте настройки SMTP и попробуйте снова.", "메일을 보내지 못했어요. SMTP 설정을 확인하고 다시 시도해 주세요."),
    # --- generic
    "{target.__name__} {value} not found": ("Не найдено: {target.__name__} {value}", "찾을 수 없어요: {target.__name__} {value}"),
    "'end' must not be before 'start'": ("Конец периода не может быть раньше начала", "종료일은 시작일보다 빠를 수 없어요"),
    "Range is limited to 60 months": ("Период ограничен 60 месяцами", "기간은 최대 60개월이에요"),
    "end_date must not be before start_date": ("Дата окончания не может быть раньше даты начала", "종료일은 시작일보다 빠를 수 없어요"),
    "'{value}' is not a month in YYYY-MM format": ("«{value}» — не месяц в формате ГГГГ-ММ", "‘{value}’은(는) YYYY-MM 형식의 월이 아니에요"),
    "Unknown timezone '{data['timezone']}'": ("Неизвестный часовой пояс «{data['timezone']}»", "알 수 없는 시간대 ‘{data['timezone']}’"),
    "Demo data is already loaded": ("Демо-данные уже загружены", "데모 데이터가 이미 로드돼 있어요"),
    # --- money parsing
    "amount is empty": ("Сумма не указана", "금액이 비어 있어요"),
    "'{raw}' is not a valid number": ("«{raw}» — не число", "‘{raw}’은(는) 올바른 숫자가 아니에요"),
    "'{raw}' has more than 2 decimal places": ("В «{raw}» больше двух знаков после запятой", "‘{raw}’의 소수점 이하 자릿수가 2자리를 넘어요"),
    "'{raw}' is too large": ("«{raw}» — слишком большое число", "‘{raw}’은(는) 너무 큰 숫자예요"),
    "'{raw}' is not a date (use YYYY-MM-DD or DD.MM.YYYY)": ("«{raw}» — не дата (используйте ГГГГ-ММ-ДД или ДД.ММ.ГГГГ)", "‘{raw}’은(는) 날짜가 아니에요 (YYYY-MM-DD 또는 DD.MM.YYYY 형식)"),
    "amount must not be zero": ("Сумма не может быть нулевой", "금액은 0일 수 없어요"),
    "amount must be greater than zero when a type is given": ("Если указан тип, сумма должна быть больше нуля", "유형을 지정한 경우 금액은 0보다 커야 해요"),
    # --- accounts
    "Account {account_id} not found": ("Счёт {account_id} не найден", "계좌 {account_id}을(를) 찾을 수 없어요"),
    "An account named '{name}' already exists": ("Счёт с названием «{name}» уже есть", "‘{name}’ 이름의 계좌가 이미 있어요"),
    "'{acc.name}' has {used} transaction(s). Accounts with history cannot be deleted; archive it instead.": ("По счёту «{acc.name}» есть операции ({used}). Счета с историей нельзя удалить — переместите его в архив.", "‘{acc.name}’에 거래가 {used}건 있어요. 내역이 있는 계좌는 삭제할 수 없으니 보관해 주세요."),
    "'{acc.name}' is used by recurring payments. Reassign or delete them first.": ("Счёт «{acc.name}» используется в регулярных платежах. Сначала переназначьте или удалите их.", "‘{acc.name}’은(는) 정기 결제에 사용 중이에요. 먼저 다른 계좌로 바꾸거나 삭제해 주세요."),
    "{role} {account_id} does not exist": ("{role} {account_id} не существует", "{role} {account_id}이(가) 존재하지 않아요"),
    "{role} '{acc.name}' is archived; unarchive it to record new transactions": ("{role} «{acc.name}» в архиве; верните его из архива, чтобы записывать операции", "{role} ‘{acc.name}’이(가) 보관돼 있어요. 새 거래를 기록하려면 보관을 해제해 주세요"),
    "Opening date cannot be after the account's first transaction ({first.isoformat()})": ("Дата открытия не может быть позже первой операции по счёту ({first.isoformat()})", "개설일은 계좌의 첫 거래({first.isoformat()})보다 늦을 수 없어요"),
    "This account still holds {bal} {acc.currency}. Transfer the money out or record an adjustment so the balance is 0 before archiving; archived balances are excluded from totals.": ("На счёте ещё {bal} {acc.currency}. Переведите деньги или запишите корректировку, чтобы баланс стал 0, — архивные балансы не входят в итоги.", "이 계좌에 아직 {bal} {acc.currency}이(가) 있어요. 보관 전에 이체하거나 조정을 기록해 잔액을 0으로 만들어 주세요. 보관된 잔액은 합계에서 제외돼요."),
    # --- categories & budgets
    "Budgets can only be set on existing expense categories": ("Бюджет можно задать только для существующей категории расходов", "예산은 기존 지출 카테고리에만 설정할 수 있어요"),
    "Category {category_id} not found": ("Категория {category_id} не найдена", "카테고리 {category_id}을(를) 찾을 수 없어요"),
    "Category {category_id} does not exist": ("Категория {category_id} не существует", "카테고리 {category_id}이(가) 존재하지 않아요"),
    "An {kind} category named '{name}' already exists": ("Категория {kind} «{name}» уже есть", "‘{name}’ 이름의 {kind} 카테고리가 이미 있어요"),
    "'{cat.name}' is used by the installments module and cannot be deleted": ("Категория «{cat.name}» нужна модулю рассрочек и не может быть удалена", "‘{cat.name}’은(는) 할부 기능에서 사용 중이라 삭제할 수 없어요"),
    "'{cat.name}' is used by {used} record(s). Archive it instead so history is preserved.": ("Категория «{cat.name}» используется в записях ({used}). Переместите её в архив, чтобы сохранить историю.", "‘{cat.name}’이(가) {used}개의 기록에서 사용 중이에요. 내역을 지키려면 대신 보관해 주세요."),
    "Choose an existing {rule_type} category": ("Выберите существующую категорию {rule_type}", "기존 {rule_type} 카테고리를 선택해 주세요"),
    "Category '{cat.name}' is archived": ("Категория «{cat.name}» в архиве", "카테고리 ‘{cat.name}’이(가) 보관돼 있어요"),
    # --- transactions
    "a transfer needs a destination account (to_account_id)": ("Для перевода нужен счёт зачисления", "이체에는 입금 계좌가 필요해요"),
    "a transfer needs two different accounts": ("Для перевода нужны два разных счёта", "이체에는 서로 다른 두 계좌가 필요해요"),
    "A transfer needs two different accounts": ("Для перевода нужны два разных счёта", "이체에는 서로 다른 두 계좌가 필요해요"),
    "transfers do not have a category": ("У переводов нет категории", "이체에는 카테고리가 없어요"),
    "Transfers do not have a category": ("У переводов нет категории", "이체에는 카테고리가 없어요"),
    "only transfers have a destination account": ("Счёт зачисления бывает только у переводов", "입금 계좌는 이체에만 있어요"),
    "Only transfers have a destination account": ("Счёт зачисления бывает только у переводов", "입금 계좌는 이체에만 있어요"),
    "to_account is only allowed for transfers": ("Счёт зачисления указывается только для переводов", "입금 계좌는 이체에만 지정할 수 있어요"),
    "An {type} needs a category": ("Для {type} нужна категория", "{type}에는 카테고리가 필요해요"),
    "'{cat.name}' is an {cat.kind} category and cannot be used for an {type}": ("«{cat.name}» — категория {cat.kind}, её нельзя использовать для {type}", "‘{cat.name}’은(는) {cat.kind} 카테고리라 {type}에 사용할 수 없어요"),
    "Transaction {tx_id} not found": ("Операция {tx_id} не найдена", "거래 {tx_id}을(를) 찾을 수 없어요"),
    "Date {tx_date} is before '{src.name}' was opened ({src.opening_date}). Change the account's opening date if you are entering older history.": ("Дата {tx_date} раньше открытия счёта «{src.name}» ({src.opening_date}). Если вносите старую историю, измените дату открытия счёта.", "{tx_date}은(는) ‘{src.name}’ 개설일({src.opening_date})보다 이전이에요. 이전 내역을 입력하려면 계좌 개설일을 변경해 주세요."),
    "Date {tx_date} is before '{dst.name}' was opened ({dst.opening_date})": ("Дата {tx_date} раньше открытия счёта «{dst.name}» ({dst.opening_date})", "{tx_date}은(는) ‘{dst.name}’ 개설일({dst.opening_date})보다 이전이에요"),
    "This transaction records an installment payment. Change the amount or account by editing that payment in Installments, so the outstanding balance stays consistent.": ("Эта операция — платёж по рассрочке. Сумму или счёт меняйте в самом платеже в разделе «Рассрочки», чтобы остаток долга оставался верным.", "이 거래는 할부 납부 기록이에요. 남은 금액이 맞도록 금액이나 계좌는 할부에서 해당 납부를 수정해 주세요."),
    "This transaction records an installment payment. Delete the payment in Installments instead; that removes both records together.": ("Эта операция — платёж по рассрочке. Удалите сам платёж в разделе «Рассрочки» — так удалятся обе записи.", "이 거래는 할부 납부 기록이에요. 대신 할부에서 납부를 삭제하면 두 기록이 함께 삭제돼요."),
    "Cross-currency transfers ({src.currency} -> {dst.currency}) are not supported yet": ("Переводы между валютами ({src.currency} → {dst.currency}) пока не поддерживаются", "통화 간 이체({src.currency} → {dst.currency})는 아직 지원되지 않아요"),
    "Choose a category when changing a transfer into an {new_type}": ("Выберите категорию: перевод меняется на операцию {new_type}", "이체를 {new_type}(으)로 바꿀 때는 카테고리를 선택해 주세요"),
    # --- csv import
    "Could not decode the file; save it as UTF-8": ("Не удалось прочитать файл — сохраните его в UTF-8", "파일을 읽을 수 없어요. UTF-8로 저장해 주세요"),
    "CSV file is larger than 5 MB": ("CSV-файл больше 5 МБ", "CSV 파일이 5MB보다 커요"),
    "The file is empty or has no header row": ("Файл пустой или в нём нет строки заголовков", "파일이 비어 있거나 머리글 행이 없어요"),
    "Missing required column(s): {', '.join(sorted(missing))}": ("Нет обязательных столбцов: {', '.join(sorted(missing))}", "필수 열이 없어요: {', '.join(sorted(missing))}"),
    "Too many rows (limit {MAX_ROWS})": ("Слишком много строк (максимум {MAX_ROWS})", "행이 너무 많아요 (최대 {MAX_ROWS}행)"),
    "unknown account '{row.get('account', '')}'": ("неизвестный счёт «{row.get('account', '')}»", "알 수 없는 계좌 ‘{row.get('account', '')}’"),
    "currency {row['currency'].upper()} does not match account currency {account.currency}": ("валюта {row['currency'].upper()} не совпадает с валютой счёта {account.currency}", "통화 {row['currency'].upper()}이(가) 계좌 통화 {account.currency}와(과) 달라요"),
    "unknown type '{row['type']}'": ("неизвестный тип «{row['type']}»", "알 수 없는 유형 ‘{row['type']}’"),
    "unknown destination account '{row.get('to_account', '')}'": ("неизвестный счёт зачисления «{row.get('to_account', '')}»", "알 수 없는 입금 계좌 ‘{row.get('to_account', '')}’"),
    "unknown {tx_type} category '{row.get('category', '')}'": ("неизвестная категория {tx_type} «{row.get('category', '')}»", "알 수 없는 {tx_type} 카테고리 ‘{row.get('category', '')}’"),
    "matches an existing transaction": ("совпадает с уже существующей операцией", "기존 거래와 같아요"),
    # --- recurring
    "unknown frequency '{frequency}'": ("неизвестная периодичность «{frequency}»", "알 수 없는 주기 ‘{frequency}’"),
    "Recurring rule {rule_id} not found": ("Регулярный платёж {rule_id} не найден", "정기 결제 {rule_id}을(를) 찾을 수 없어요"),
    "{data.occurrence_date} is not a scheduled date for '{rule.name}'": ("{data.occurrence_date} — не плановая дата для «{rule.name}»", "{data.occurrence_date}은(는) ‘{rule.name}’의 예정일이 아니에요"),
    "The {data.occurrence_date} occurrence of '{rule.name}' is already recorded": ("Платёж «{rule.name}» за {data.occurrence_date} уже записан", "‘{rule.name}’의 {data.occurrence_date} 회차는 이미 기록됐어요"),
    "Only the next due occurrence can be skipped": ("Пропустить можно только ближайший платёж", "다음 예정 회차만 건너뛸 수 있어요"),
    # --- installments
    "outstanding amount cannot exceed the original amount": ("Остаток не может быть больше исходной суммы", "남은 금액은 원래 금액보다 클 수 없어요"),
    "Installment plan {plan_id} not found": ("Рассрочка {plan_id} не найдена", "할부 {plan_id}을(를) 찾을 수 없어요"),
    "This plan is fully repaid and cannot be reactivated": ("Рассрочка полностью погашена и не может быть возобновлена", "이 할부는 모두 상환돼 다시 활성화할 수 없어요"),
    "'{plan.name}' has {len(plan.payments)} recorded payment(s). Set its status to cancelled to keep the history, or delete the payments first.": ("По рассрочке «{plan.name}» есть платежи ({len(plan.payments)}). Чтобы сохранить историю, отмените её, или сначала удалите платежи.", "‘{plan.name}’에 기록된 납부가 {len(plan.payments)}건 있어요. 내역을 남기려면 취소 상태로 바꾸거나 먼저 납부를 삭제해 주세요."),
    "'{plan.name}' is {plan.status.replace('_', ' ')}; no further payments expected": ("Рассрочка «{plan.name}» {plan.status.replace('_', ' ')}; платежей больше не ожидается", "‘{plan.name}’은(는) {plan.status.replace('_', ' ')} 상태라 더 이상 납부가 없어요"),
    "Payment of {data.amount} exceeds the outstanding balance of {remaining} {plan.currency}": ("Платёж {data.amount} больше остатка долга {remaining} {plan.currency}", "납부액 {data.amount}이(가) 남은 금액 {remaining} {plan.currency}보다 많아요"),
    "Payment {payment_id} not found on this plan": ("Платёж {payment_id} не найден в этой рассрочке", "이 할부에서 납부 {payment_id}을(를) 찾을 수 없어요"),
    "Default account '{acc.name}' is in {acc.currency}, not {data.currency}": ("Счёт по умолчанию «{acc.name}» в {acc.currency}, а не в {data.currency}", "기본 계좌 ‘{acc.name}’의 통화는 {data.currency}이(가) 아니라 {acc.currency}예요"),
    "Default account '{acc.name}' is in {acc.currency}, not {plan.currency}": ("Счёт по умолчанию «{acc.name}» в {acc.currency}, а не в {plan.currency}", "기본 계좌 ‘{acc.name}’의 통화는 {plan.currency}이(가) 아니라 {acc.currency}예요"),
    "Choose the account the payment was made from": ("Выберите счёт, с которого был платёж", "납부한 계좌를 선택해 주세요"),
    "'{acc.name}' is in {acc.currency}, but this plan is in {plan.currency}": ("Счёт «{acc.name}» в {acc.currency}, а рассрочка — в {plan.currency}", "‘{acc.name}’은(는) {acc.currency}인데 이 할부는 {plan.currency}예요"),
    # --- planning
    "recurring tasks need a due date": ("Для повторяющейся задачи нужен срок", "반복 할 일에는 마감일이 필요해요"),
    "Recurring tasks need a due date": ("Для повторяющейся задачи нужен срок", "반복 할 일에는 마감일이 필요해요"),
    "a due time needs a due date": ("Время без даты срока указать нельзя", "마감 시간을 정하려면 마감일이 필요해요"),
    "A due time needs a due date": ("Время без даты срока указать нельзя", "마감 시간을 정하려면 마감일이 필요해요"),
    "task is not recurring": ("Задача не повторяющаяся", "반복 할 일이 아니에요"),
    "Task {task_id} not found": ("Задача {task_id} не найдена", "할 일 {task_id}을(를) 찾을 수 없어요"),
    "a measurable goal needs a target value": ("Для измеримой цели нужно целевое значение", "측정 가능한 목표에는 목표값이 필요해요"),
    "A measurable goal needs a target value": ("Для измеримой цели нужно целевое значение", "측정 가능한 목표에는 목표값이 필요해요"),
    "Goal {goal_id} not found": ("Цель {goal_id} не найдена", "목표 {goal_id}을(를) 찾을 수 없어요"),
    "Goal {goal_id} does not exist": ("Цель {goal_id} не существует", "목표 {goal_id}이(가) 존재하지 않아요"),
    "Milestone not found": ("Этап не найден", "단계를 찾을 수 없어요"),
    "Project {project_id} not found": ("Проект {project_id} не найден", "프로젝트 {project_id}을(를) 찾을 수 없어요"),
    "Project {project_id} does not exist": ("Проект {project_id} не существует", "프로젝트 {project_id}이(가) 존재하지 않아요"),
    "pick at least one weekday": ("Выберите хотя бы один день недели", "요일을 하나 이상 선택해 주세요"),
    "Pick at least one weekday": ("Выберите хотя бы один день недели", "요일을 하나 이상 선택해 주세요"),
    "Habit {habit_id} not found": ("Привычка {habit_id} не найдена", "습관 {habit_id}을(를) 찾을 수 없어요"),
    "Habits cannot be completed in the future": ("Привычку нельзя отметить на будущую дату", "미래 날짜에는 습관을 완료할 수 없어요"),
    "'{habit.name}' starts on {habit.start_date}": ("Привычка «{habit.name}» начинается {habit.start_date}", "‘{habit.name}’은(는) {habit.start_date}에 시작돼요"),
    # --- profile
    "Birthday must be between 1900 and today": ("Дата рождения должна быть между 1900 годом и сегодняшним днём", "생일은 1900년부터 오늘 사이여야 해요"),
    "The image is larger than 2 MB": ("Изображение больше 2 МБ", "이미지가 2MB보다 커요"),
    "Upload a PNG, JPEG or WebP image": ("Загрузите изображение PNG, JPEG или WebP", "PNG, JPEG 또는 WebP 이미지를 올려 주세요"),
    "No avatar": ("Аватара нет", "프로필 사진이 없어요"),
    "Income source not found": ("Источник дохода не найден", "수입원을 찾을 수 없어요"),
    # --- handler fallbacks
    "Invalid input": ("Некорректные данные", "입력값이 올바르지 않아요"),
    "This change conflicts with existing data": ("Это изменение конфликтует с уже существующими данными", "이 변경은 기존 데이터와 충돌해요"),
}

# Field names shown in validation messages.
FIELDS: dict[str, dict[str, str]] = {
    "ru": {
        "amount": "Сумма", "date": "Дата", "name": "Название", "title": "Название", "type": "Тип", "currency": "Валюта",
        "account_id": "Счёт", "to_account_id": "Счёт зачисления", "category_id": "Категория", "description": "Описание",
        "payee": "Получатель", "tags": "Теги", "opening_balance": "Начальный баланс", "opening_date": "Дата открытия",
        "email": "Почта", "password": "Пароль", "new_password": "Новый пароль", "current_password": "Текущий пароль",
        "username": "Логин", "identifier": "Логин или почта", "code": "Код", "due_date": "Срок", "due_time": "Время",
        "target_value": "Целевое значение", "current_value": "Текущее значение", "target_date": "Целевая дата",
        "month": "Месяц", "frequency": "Периодичность", "start_date": "Дата начала", "end_date": "Дата окончания",
        "original_amount": "Исходная сумма", "outstanding_amount": "Остаток", "payment_amount": "Сумма платежа",
        "first_name": "Имя", "last_name": "Фамилия", "phone": "Телефон", "birthday": "Дата рождения", "city": "Город",
        "salary_amount": "Зарплата", "weekdays": "Дни недели", "color": "Цвет", "timezone": "Часовой пояс",
        "notes": "Заметки", "note": "Заметка", "priority": "Приоритет", "status": "Статус",
    },
    "ko": {
        "amount": "금액", "date": "날짜", "name": "이름", "title": "제목", "type": "유형", "currency": "통화",
        "account_id": "계좌", "to_account_id": "입금 계좌", "category_id": "카테고리", "description": "설명",
        "payee": "받는 사람", "tags": "태그", "opening_balance": "초기 잔액", "opening_date": "개설일",
        "email": "이메일", "password": "비밀번호", "new_password": "새 비밀번호", "current_password": "현재 비밀번호",
        "username": "아이디", "identifier": "아이디 또는 이메일", "code": "코드", "due_date": "마감일", "due_time": "마감 시간",
        "target_value": "목표값", "current_value": "현재값", "target_date": "목표일",
        "month": "월", "frequency": "주기", "start_date": "시작일", "end_date": "종료일",
        "original_amount": "원래 금액", "outstanding_amount": "남은 금액", "payment_amount": "납부액",
        "first_name": "이름", "last_name": "성", "phone": "전화번호", "birthday": "생일", "city": "도시",
        "salary_amount": "급여", "weekdays": "요일", "color": "색상", "timezone": "시간대",
        "notes": "메모", "note": "메모", "priority": "우선순위", "status": "상태",
    },
}

# Pydantic error types -> (en, ru, ko); {ctx} values come from the error's ctx.
PYDANTIC: dict[str, tuple[str, str, str]] = {
    "missing": ("Required", "Обязательное поле", "필수 항목이에요"),
    "string_too_short": ("Too short (min {min_length})", "Слишком коротко (минимум {min_length})", "너무 짧아요 (최소 {min_length}자)"),
    "string_too_long": ("Too long (max {max_length})", "Слишком длинно (максимум {max_length})", "너무 길어요 (최대 {max_length}자)"),
    "too_short": ("Too few items (min {min_length})", "Слишком мало элементов (минимум {min_length})", "항목이 너무 적어요 (최소 {min_length}개)"),
    "too_long": ("Too many items (max {max_length})", "Слишком много элементов (максимум {max_length})", "항목이 너무 많아요 (최대 {max_length}개)"),
    "greater_than": ("Must be greater than {gt}", "Должно быть больше {gt}", "{gt}보다 커야 해요"),
    "greater_than_equal": ("Must be at least {ge}", "Должно быть не меньше {ge}", "{ge} 이상이어야 해요"),
    "less_than": ("Must be less than {lt}", "Должно быть меньше {lt}", "{lt}보다 작아야 해요"),
    "less_than_equal": ("Must be at most {le}", "Должно быть не больше {le}", "{le} 이하여야 해요"),
    "int_parsing": ("Enter a whole number", "Введите целое число", "정수를 입력해 주세요"),
    "int_type": ("Enter a whole number", "Введите целое число", "정수를 입력해 주세요"),
    "int_from_float": ("Enter a whole number", "Введите целое число", "정수를 입력해 주세요"),
    "float_parsing": ("Enter a number", "Введите число", "숫자를 입력해 주세요"),
    "float_type": ("Enter a number", "Введите число", "숫자를 입력해 주세요"),
    "decimal_parsing": ("Enter a number", "Введите число", "숫자를 입력해 주세요"),
    "decimal_type": ("Enter a number", "Введите число", "숫자를 입력해 주세요"),
    "decimal_max_places": ("At most {decimal_places} decimal places", "Не больше {decimal_places} знаков после запятой", "소수점 이하 최대 {decimal_places}자리"),
    "decimal_max_digits": ("Too many digits (max {max_digits})", "Слишком много цифр (максимум {max_digits})", "자릿수가 너무 많아요 (최대 {max_digits}자리)"),
    "decimal_whole_digits": ("Too many digits before the decimal point", "Слишком много цифр до запятой", "소수점 앞 자릿수가 너무 많아요"),
    "date_parsing": ("Enter a valid date", "Введите корректную дату", "올바른 날짜를 입력해 주세요"),
    "date_from_datetime_parsing": ("Enter a valid date", "Введите корректную дату", "올바른 날짜를 입력해 주세요"),
    "date_type": ("Enter a valid date", "Введите корректную дату", "올바른 날짜를 입력해 주세요"),
    "time_parsing": ("Enter a valid time", "Введите корректное время", "올바른 시간을 입력해 주세요"),
    "time_type": ("Enter a valid time", "Введите корректное время", "올바른 시간을 입력해 주세요"),
    "datetime_parsing": ("Enter a valid date and time", "Введите корректные дату и время", "올바른 날짜와 시간을 입력해 주세요"),
    "bool_parsing": ("Must be yes or no", "Должно быть «да» или «нет»", "예 또는 아니요여야 해요"),
    "bool_type": ("Must be yes or no", "Должно быть «да» или «нет»", "예 또는 아니요여야 해요"),
    "string_type": ("Must be text", "Должно быть текстом", "텍스트여야 해요"),
    "string_pattern_mismatch": ("Invalid format", "Неверный формат", "형식이 올바르지 않아요"),
    "literal_error": ("Choose one of: {expected}", "Выберите одно из значений: {expected}", "다음 중 하나를 선택해 주세요: {expected}"),
    "enum": ("Choose one of: {expected}", "Выберите одно из значений: {expected}", "다음 중 하나를 선택해 주세요: {expected}"),
    "list_type": ("Must be a list", "Должно быть списком", "목록이어야 해요"),
    "dict_type": ("Invalid value", "Некорректное значение", "값이 올바르지 않아요"),
    "model_type": ("Invalid value", "Некорректное значение", "값이 올바르지 않아요"),
    "model_attributes_type": ("Invalid value", "Некорректное значение", "값이 올바르지 않아요"),
    "json_invalid": ("The request is not valid JSON", "Запрос — некорректный JSON", "요청이 올바른 JSON이 아니에요"),
    "extra_forbidden": ("Unknown field", "Неизвестное поле", "알 수 없는 항목이에요"),
    "finite_number": ("Enter a finite number", "Введите конечное число", "유한한 숫자를 입력해 주세요"),
}
_FALLBACK = ("Invalid value", "Некорректное значение", "값이 올바르지 않아요")
_IDX = {"en": 0, "ru": 1, "ko": 2}


@lru_cache(maxsize=1)
def _patterns() -> list[tuple[re.Pattern, list[str], str]]:
    out = []
    for tpl in MESSAGES:
        names = re.findall(r"\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}", tpl)
        if not names:
            continue
        parts = re.split(r"\{(?:[^{}]*(?:\{[^{}]*\}[^{}]*)*)\}", tpl)
        # Ids are single tokens; everything else may contain spaces ("Destination account").
        grp = [r"(\S+)" if (n.endswith("_id") or n == "value") else "(.+?)" for n in names]
        rx = "".join(re.escape(p) + (grp[i] if i < len(names) else "") for i, p in enumerate(parts))
        out.append((re.compile(f"^{rx}$", re.S), names, tpl))
    # Most literal text first, so "Goal {id} not found" beats "{target.__name__} {value} not found".
    out.sort(key=lambda x: -len(re.sub(r"\((?:\.\+\?|\S\+)\)", "", x[0].pattern)))
    return out


def translate(message: str, lang: str) -> str:
    """English message (as raised) -> the same message in `lang`; unknown text is returned as is."""
    if lang not in ("ru", "ko") or not message:
        return message
    i = _IDX[lang] - 1
    if message in MESSAGES:
        return MESSAGES[message][i]
    values = VALUES[lang]
    for rx, names, tpl in _patterns():
        m = rx.match(message)
        if m:
            out = MESSAGES[tpl][i]
            for name, val in zip(names, m.groups()):
                out = out.replace("{" + name + "}", values.get(val, val), 1)
            return out
    return message


def field_label(path: str, lang: str) -> str:
    last = path.split(".")[-1] if path else path
    return FIELDS.get(lang, {}).get(last, path)


def pydantic_message(err: dict, lang: str) -> str:
    """One pydantic error -> readable text. Custom validator messages go through `translate`."""
    if err.get("type") == "value_error":
        raw = str(err.get("ctx", {}).get("error", "")) or err.get("msg", "").removeprefix("Value error, ")
        return translate(raw, lang)
    tpl = PYDANTIC.get(err.get("type", ""), _FALLBACK)[_IDX.get(lang, 0)]
    ctx = {k: v for k, v in (err.get("ctx") or {}).items()}
    try:
        return tpl.format(**ctx)
    except (KeyError, IndexError, ValueError):
        return re.sub(r"\s*\(.*\{.*\}.*\)|\{[^}]*\}", "", tpl).strip()
