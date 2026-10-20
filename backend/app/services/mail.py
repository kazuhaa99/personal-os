"""Outgoing email over SMTP (STARTTLS). Used only for email confirmation codes."""

import logging
import smtplib
from email.message import EmailMessage
from email.utils import parseaddr

from app.config import get_settings
from app.errors import DomainError

log = logging.getLogger("personal_os.mail")


class MailUnavailable(DomainError):
    status_code = 503
    code = "mail_unavailable"


def is_configured() -> bool:
    s = get_settings()
    return bool(s.smtp_password) or s.mail_dev_log


def send(to: str, subject: str, text: str) -> None:
    s = get_settings()
    if not s.smtp_password:
        if s.mail_dev_log:
            # Development only: the message never leaves the machine.
            log.warning("POS_MAIL_DEV_LOG: email to %s — %s\n%s", to, subject, text)
            return
        raise MailUnavailable("Email sending is not configured on the server (POS_SMTP_PASSWORD)")
    msg = EmailMessage()
    msg["From"] = s.mail_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            smtp.login(s.smtp_user or parseaddr(s.mail_from)[1], s.smtp_password)
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as exc:
        log.error("sending mail failed: %s", type(exc).__name__)
        raise MailUnavailable("Could not send the email. Check the SMTP settings and try again.") from exc
