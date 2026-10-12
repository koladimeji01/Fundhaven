"""Send opt-in monthly finance summaries through Brevo.

Production scheduler command (run DAILY at 09:00 Africa/Lagos):
    python -m app.monthly_reports

The job sends the previous calendar month's report only during the first
seven days of a month. Database claims prevent routine duplicate dispatches.
Do not invoke this job from the FastAPI app lifespan (multiple workers).
"""
import argparse
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from html import escape
import time

from app import database
from app.email import EmailDeliveryError, brevo_configured, send_email
from app.logging_config import logger
from app.monthly import resolve_month

TZ = timezone(timedelta(hours=1), name="Africa/Lagos")
RETRY_CLAIM_AFTER_SECONDS = 30 * 60


def previous_month(today: date) -> str:
    last = today.replace(day=1) - timedelta(days=1)
    return last.strftime("%Y-%m")


def _money(value) -> str:
    return "₦{:,.2f}".format(float(value))


def _report_for(user_id: int, name: str, month: str):
    records = database.get_month_expenses(user_id, month)
    income = database.get_monthly_income(user_id, month)
    spent = sum(float(row[1]) for row in records)
    groups = defaultdict(float)
    for row in records:
        groups[str(row[2]) or "Other"] += float(row[1])
    balance = (income - spent) if income is not None else None
    savings = (balance / income * 100) if income and balance is not None else None

    year, month_num = map(int, month.split("-"))
    heading = date(year, month_num, 1).strftime("%B %Y")
    breakdown = sorted(groups.items(), key=lambda item: -item[1])

    rows = "".join(
        "<tr><td style='padding:9px 12px;border-bottom:1px solid #edf1ee'>"
        + escape(category)
        + "</td><td align='right' style='padding:9px 12px;border-bottom:1px solid #edf1ee'>"
        + escape(_money(value)) + "</td></tr>"
        for category, value in breakdown
    ) or "<tr><td colspan='2'>No expenses recorded this month.</td></tr>"

    income_label = _money(income) if income is not None else "Not recorded"
    balance_label = _money(balance) if balance is not None else "Not available"
    savings_label = "{:.1f}%".format(savings) if savings is not None else "Not available"

    plain = (
        "Hello " + name + ",\n\n"
        "Your BudgetWise report for " + heading + " (amounts in NGN):\n"
        "Monthly income: " + income_label + "\n"
        "Monthly expenses: " + _money(spent) + "\n"
        "Monthly balance: " + balance_label + "\n"
        "Savings rate: " + savings_label + "\n\n"
        "Spending by category:\n"
        + "".join(category + ": " + _money(value) + "\n"
                  for category, value in breakdown)
        + "\nOpen BudgetWise to see more details.\n"
    )

    html = (
        "<html><body style='background:#f5f8f6;font-family:Arial,sans-serif;color:#17352a'>"
        "<div style='max-width:580px;background:#fff;margin:30px auto;padding:30px;border-radius:16px'>"
        "<h2 style='color:#123d2c'>BudgetWise monthly report</h2>"
        "<p>Hello " + escape(name) + ", here is your " + escape(heading) + " summary.</p>"
        "<p style='color:#71887a;font-size:12px'>Amounts shown in Nigerian naira (NGN).</p>"
        "<table width='100%' cellspacing='0' style='font-size:14px'>"
        "<tr><td style='padding:10px'>Income</td><td align='right'>" + escape(income_label) + "</td></tr>"
        "<tr><td style='padding:10px'>Expenses</td><td align='right'>" + escape(_money(spent)) + "</td></tr>"
        "<tr><td style='padding:10px'>Balance</td><td align='right'>" + escape(balance_label) + "</td></tr>"
        "<tr><td style='padding:10px'>Savings rate</td><td align='right'>" + escape(savings_label) + "</td></tr>"
        "</table><h3>Spending by category</h3>"
        "<table width='100%' cellspacing='0' style='font-size:13px'>" + rows + "</table>"
        "<p style='color:#819689;font-size:12px'>"
        "You received this email because you enabled monthly reports in BudgetWise Settings. "
        "You can turn them off there at any time.</p>"
        "</div></body></html>"
    )
    return heading, plain, html


def _claim(user_id: int, month: str) -> bool:
    now = int(time.time())
    conn = database.create_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("""
            SELECT status, claimed_at FROM monthly_report_delivery
            WHERE user_id=? AND report_month=?
        """, (user_id, month)).fetchone()

        if row:
            if row[0] == "sent":
                conn.commit()
                return False
            if row[0] == "sending" and row[1] > now - RETRY_CLAIM_AFTER_SECONDS:
                conn.commit()
                return False
            conn.execute("""
                UPDATE monthly_report_delivery
                SET status='sending', claimed_at=?
                WHERE user_id=? AND report_month=?
            """, (now, user_id, month))
        else:
            conn.execute("""
                INSERT INTO monthly_report_delivery
                    (user_id, report_month, status, claimed_at)
                VALUES (?, ?, 'sending', ?)
            """, (user_id, month, now))
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _finish(user_id: int, month: str, succeeded: bool, message_id=None):
    conn = database.create_connection()
    try:
        conn.execute("""
            UPDATE monthly_report_delivery
            SET status=?, sent_at=?, provider_message_id=?
            WHERE user_id=? AND report_month=?
        """, (
            "sent" if succeeded else "failed",
            int(time.time()) if succeeded else None,
            message_id if succeeded else None,
            user_id, month
        ))
        conn.commit()
    finally:
        conn.close()


def send_monthly_reports(today: date | None = None, dry_run=False):
    today = today or datetime.now(TZ).date()

    # A 7-day retry window protects against overnight outages.
    if today.day > 7:
        return {"period": None, "sent": 0, "skipped": 0, "failed": 0}

    month = resolve_month(previous_month(today))
    if not dry_run and not brevo_configured():
        raise EmailDeliveryError(
            "Configure BREVO_API_KEY and BREVO_SENDER_EMAIL on the server"
        )

    conn = database.create_connection()
    try:
        subscribers = conn.execute("""
            SELECT id, name, email FROM users
            WHERE monthly_reports_enabled=1
              AND email IS NOT NULL AND TRIM(email) != ''
            ORDER BY id
        """).fetchall()
    finally:
        conn.close()

    result = {"period": month, "sent": 0, "skipped": 0, "failed": 0}
    for user_id, name, email in subscribers:
        if dry_run:
            _report_for(user_id, name, month)
            result["skipped"] += 1
            continue
        if not _claim(user_id, month):
            result["skipped"] += 1
            continue

        try:
            heading, plain, html_content = _report_for(user_id, name, month)
            message_id = send_email(
                email,
                "Your BudgetWise report — " + heading,
                plain,
                html_content
            )
            _finish(user_id, month, True, message_id)
            result["sent"] += 1
        except Exception:
            _finish(user_id, month, False)
            result["failed"] += 1
            # Do not reveal account data, addresses or message contents in logs.
            logger.exception("Monthly report delivery failed for user %s", user_id)
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Send the previous month's BudgetWise reports"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Prepare reports without sending emails")
    args = parser.parse_args()
    report = send_monthly_reports(dry_run=args.dry_run)
    print(
        "Monthly reports: period={period} sent={sent} skipped={skipped} failed={failed}"
        .format(**report)
    )
    if report["failed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
