from email.message import EmailMessage
import smtplib

from app.core.config import settings


class EmailSenderError(RuntimeError):
    pass


def _is_smtp_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from_email)


def send_verification_code_email(*, to_email: str, code: str, expires_minutes: int) -> bool:
    """Return True when mail sent, False when SMTP is not configured."""
    if not _is_smtp_configured():
        return False

    subject = "[Mind Check] 이메일 인증코드"
    body = (
        "안녕하세요.\n\n"
        f"회원가입/이메일변경 인증코드는 {code} 입니다.\n"
        f"유효시간은 {expires_minutes}분입니다.\n\n"
        "본 메일은 자동 발송되었습니다."
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from_email
    msg["To"] = to_email
    msg.set_content(body)

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                if settings.smtp_username:
                    server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                if settings.smtp_use_tls:
                    server.starttls()
                if settings.smtp_username:
                    server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(msg)
    except Exception as exc:  # pragma: no cover
        raise EmailSenderError(f"SMTP send failed: {exc}") from exc

    return True
