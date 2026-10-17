"""Stage 2: protect the existing six-page UI structure against regressions.

These checks validate source assets and navigation only, not a browser render.
The app's Lucide icons and existing HTML/CSS structure remain untouched.
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

import pytest


FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
PAGES = (
    "dashboard.html", "transactions.html", "budgets.html",
    "reports.html", "goals.html", "settings.html",
)


class PageLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.scripts = []
        self.stylesheets = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a" and a.get("href"):
            self.links.append(a["href"])
        if tag == "script" and a.get("src"):
            self.scripts.append(a["src"])
        if tag == "link" and a.get("rel") == "stylesheet" and a.get("href"):
            self.stylesheets.append(a["href"])


def local_asset(link):
    parsed = urlsplit(link)
    if parsed.scheme or parsed.netloc or link.startswith(("#", "/", "data:")):
        return None
    path = (FRONTEND / parsed.path).resolve()
    if not path.is_relative_to(FRONTEND.resolve()):
        raise AssertionError(f"Asset escapes frontend directory: {link}")
    return path


@pytest.mark.parametrize("page", PAGES)
def test_main_screen_has_all_navigation_and_shared_topbar(page):
    source = (FRONTEND / page).read_text(encoding="utf-8")
    parsed = PageLinks()
    parsed.feed(source)
    for destination in PAGES:
        assert destination in parsed.links, f"{page} lacks navigation to {destination}"
    assert "js/topbar.js" in parsed.scripts, f"{page} missing shared topbar"
    assert "js/runtime-config.js" in parsed.scripts, f"{page} missing runtime API config"
    assert "FundHaven" in source, f"{page} missing product branding"


@pytest.mark.parametrize("page", (*PAGES, "login.html", "register.html"))
def test_scripts_and_stylesheets_reference_existing_local_files(page):
    parsed = PageLinks()
    parsed.feed((FRONTEND / page).read_text(encoding="utf-8"))
    for asset in (*parsed.scripts, *parsed.stylesheets):
        local = local_asset(asset)
        if local is not None:
            assert local.is_file(), f"{page}: missing asset {asset}"
