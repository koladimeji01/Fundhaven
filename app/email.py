"""Brevo transactional email delivery for FundHaven.

Brevo credentials are read only on the server from environment variables.
Never put an API key in JavaScript or commit the .env file.
"""
import html
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.logging_config import logger


class EmailDeliveryError(RuntimeError):
    """A transactional email was not accepted by the provider."""


def brevo_configured():
    return bool(
        os.getenv("BREVO_API_KEY")
        and os.getenv("BREVO_SENDER_EMAIL")
    )


def send_email(recipient: str, subject: str, body: str, html_body: str | None = None):
    """Send a transactional email and return provider's message identifier.

    A successful response means accepted by Brevo, not guaranteed delivery.
    """
    api_key = os.getenv("BREVO_API_KEY")
    sender = os.getenv("BREVO_SENDER_EMAIL")
    if not api_key or not sender:
        raise EmailDeliveryError("Brevo is not configured")

    payload = {
        "sender": {
            "email": sender,
            "name": os.getenv("BREVO_SENDER_NAME", "FundHaven"),
        },
        "to": [{"email": recipient}],
        "subject": subject,
        "textContent": body,
    }
    if html_body:
        payload.pop("textContent")
        payload["htmlContent"] = html_body

    request = Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "api-key": api_key,
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data.get("messageId")
    except HTTPError as exc:
        logger.error("Brevo rejected email (HTTP %s)", exc.code)
        raise EmailDeliveryError("Brevo rejected this email request") from exc
    except (URLError, TimeoutError, ValueError, OSError) as exc:
        logger.error("Brevo email transport failed: %s", type(exc).__name__)
        raise EmailDeliveryError("Email delivery is temporarily unavailable") from exc


def send_welcome_email(recipient: str, name: str):
    """Welcome messages are optional and must not interrupt registration.

    Login no longer requires sending a verification code.
    """
    if not brevo_configured():
        return None
    try:
        return send_email(
            recipient,
            "Welcome to FundHaven",
            "Hello " + name + ",\n\nWelcome to FundHaven. "
            "Your personal finance account is ready.\n\nThe FundHaven Team",
        )
    except EmailDeliveryError:
        logger.warning("Optional welcome email could not be sent")
        return None
