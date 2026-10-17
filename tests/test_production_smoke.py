"""Production checker is read-only and fails if profile data is public."""
from scripts.production_smoke import run, valid_url
import pytest

def test_rejects_insecure_urls():
    for url in ["http://site.example.com/api/v1", "https://name:password@api.example.com/api/v1", "https://api.example.com/api/v1?key=x"]:
        with pytest.raises(ValueError):
            valid_url(url, api=True)

def test_smoke_requests_are_read_only_and_protected_data_is_private():
    observed = []
    def fake(url, method, headers):
        observed.append((url,method,headers))
        if url.endswith("/health"):
            return 200,{},b"healthy"
        if url.endswith("/ready"):
            return 200,{},b"ready"
        if url.endswith("/api/v1/"):
            return 200,{},b'{"version":"1"}'
        if url.endswith("/users/me"):
            return 403,{},b""
        if url.endswith("/js/runtime-config.js"):
            return 200,{},b'https://api.example.com/api/v1'
        if method=="OPTIONS":
            return 200,{"access-control-allow-origin":"https://site.example.com"},b""
        if url.endswith("/login.html"):
            return 200,{},b'<form id="loginForm">'
        return 200,{},b"FundHaven"
    assert run("https://site.example.com","https://api.example.com/api/v1",fake) == []
    assert all(method in ("GET","OPTIONS") for _,method,_ in observed)
    assert all("Authorization" not in headers for _,_,headers in observed)
