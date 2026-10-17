"""Read-only FundHaven production smoke checks (GET/OPTIONS only).

Usage:
 python scripts/production_smoke.py --frontend https://SITE.vercel.app --api https://API.onrender.com/api/v1

Never register accounts, make writes, print protected API bodies, or pass tokens.
"""
import argparse
import sys
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError


def valid_url(value, api=False):
    url = value.rstrip("/")
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
        raise ValueError("Only public, credential-free HTTPS URLs are supported")
    if api and parts.path != "/api/v1":
        raise ValueError("API URL must end with /api/v1")
    if not api and parts.path not in ("", "/"):
        raise ValueError("Frontend URL must be the origin")
    return url


def probe(url, method="GET", headers=None):
    if method not in ("GET", "OPTIONS"):
        raise ValueError("The production smoke checker never writes")
    request = Request(url, method=method, headers=headers or {})
    try:
        with urlopen(request, timeout=12) as response:
            return response.status, dict(response.headers), response.read(8192)
    except HTTPError as error:
        return error.code, dict(error.headers), b""


def run(frontend, api, request=probe):
    frontend = valid_url(frontend)
    api = valid_url(api, api=True)
    base = api.removesuffix("/api/v1")
    origin = frontend
    checks = [
        ("Backend /health", base+"/health", "GET", {}, lambda code,h,b: code == 200 and b"healthy" in b),
        ("Database /ready", base+"/ready", "GET", {}, lambda code,h,b: code == 200 and b"ready" in b),
        ("API root", api+"/", "GET", {}, lambda code,h,b: code == 200 and b"version" in b),
        ("Protected profile denies guests", api+"/users/me", "GET", {}, lambda code,h,b: code in (401,403)),
        ("Frontend loads", frontend+"/", "GET", {}, lambda code,h,b: code == 200 and b"FundHaven" in b),
        ("Login page loads", frontend+"/login.html", "GET", {}, lambda code,h,b: code == 200 and b"loginForm" in b),
        ("Frontend API points to deployed backend", frontend+"/js/runtime-config.js", "GET", {},
         lambda code,h,b: code == 200 and api.encode() in b and b"127.0.0.1:8000" not in b),
        ("CORS allows deployed frontend", api+"/login", "OPTIONS",
         {"Origin":origin, "Access-Control-Request-Method":"POST", "Access-Control-Request-Headers":"content-type"},
         lambda code,h,b: code in (200,204) and {k.lower():v for k,v in h.items()}.get("access-control-allow-origin")==origin)
    ]
    failed = []
    for name,url,method,headers,validate in checks:
        try:
            result = request(url, method=method, headers=headers)
            passed = validate(*result)
        except Exception:
            passed = False
        print(("[PASS] " if passed else "[FAIL] ") + name)
        if not passed:
            failed.append(name)
    return failed


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--frontend", required=True)
    parser.add_argument("--api", required=True)
    opts = parser.parse_args()
    try:
        problems = run(opts.frontend, opts.api)
    except ValueError as exc:
        parser.error(str(exc))
    sys.exit(1 if problems else 0)
