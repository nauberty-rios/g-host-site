#!/usr/bin/env python3
"""Validação estática/local do pacote G-Host.

Não faz chamadas de rede nem usa segredos. O objetivo é impedir que uma publicação
quebrada chegue ao GitHub Pages/Worker por erros básicos de estrutura, referências,
sintaxe ou schema.
"""
from __future__ import annotations

import hashlib
import re
import sqlite3
import subprocess
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CRITICAL = [
    "index.html", "cliente.html", "contrato.html", "admin.html", "staff.html",
    "site-data.js", "plans-data.js", "catalog-data.js", "visibility-data.js",
    "publisher-worker/worker.js", "publisher-worker/schema.sql",
    "publisher-worker/migrations/003_plataforma_integrada.sql",
]

SECRET_PATTERNS = [
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"re_[A-Za-z0-9]{20,}"),
]

class HTMLRefs(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.refs: list[str] = []
        self.ids: list[str] = []
        self.inline_handlers: list[str] = []
        self.inline_scripts = 0

    def handle_starttag(self, tag: str, attrs):
        data = dict(attrs)
        if data.get("id"):
            self.ids.append(data["id"])
        for key, value in attrs:
            if key.lower().startswith("on"):
                self.inline_handlers.append(f"{tag}:{key}")
        if tag == "script" and not data.get("src"):
            self.inline_scripts += 1
        for key in ("src", "href"):
            value = data.get(key)
            if value:
                self.refs.append(value)


def fail(message: str) -> None:
    print(f"ERRO: {message}")
    raise SystemExit(1)


def check_structure() -> None:
    for rel in CRITICAL:
        if not (ROOT / rel).exists():
            fail(f"arquivo obrigatório ausente: {rel}")
    if (ROOT / "G-HOST-PLATAFORMA-INTEGRADA").exists():
        fail("há uma pasta externa duplicada dentro da raiz; envie o conteúdo para a raiz")
    print("[ok] estrutura crítica")


def check_js() -> None:
    files = sorted(ROOT.glob("*.js")) + [ROOT / "publisher-worker/worker.js"]
    for path in files:
        result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
        if result.returncode:
            fail(f"JavaScript inválido em {path.name}: {result.stderr.strip()}")
    print(f"[ok] sintaxe JavaScript ({len(files)} arquivos)")


def check_worker_copy() -> None:
    a = (ROOT / "G-HOST-WORKER-TOTP-PLANOS.js").read_bytes()
    b = (ROOT / "publisher-worker/worker.js").read_bytes()
    if a != b:
        fail("G-HOST-WORKER-TOTP-PLANOS.js difere de publisher-worker/worker.js")
    print("[ok] cópia do Worker idêntica")


def check_schema() -> None:
    sql = (ROOT / "publisher-worker/schema.sql").read_text(encoding="utf-8")
    con = sqlite3.connect(":memory:")
    con.executescript(sql)
    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    required = {
        "people", "projects", "assets", "audit_log", "user_accounts", "user_devices",
        "contracts", "legal_acceptances", "notifications", "security_events",
        "analytics_events", "camera_integrations", "guardian_nodes", "guardian_events",
        "support_tickets", "emergency_contacts",
    }
    missing = required - tables
    if missing:
        fail("tabelas ausentes no schema: " + ", ".join(sorted(missing)))
    user_cols = {r[1] for r in con.execute("PRAGMA table_info(user_accounts)")}
    if "auth_version" not in user_cols:
        fail("user_accounts.auth_version ausente")
    contract_cols = {r[1] for r in con.execute("PRAGMA table_info(contracts)")}
    for name in ("title", "summary", "body_text", "amount", "document_hash", "signed_at"):
        if name not in contract_cols:
            fail(f"contracts.{name} ausente")
    print(f"[ok] schema SQLite ({len(tables)} tabelas)")


def check_html() -> None:
    htmls = sorted(ROOT.glob("*.html"))
    missing: list[str] = []
    for page in htmls:
        parser = HTMLRefs()
        parser.feed(page.read_text(encoding="utf-8"))
        dup = [x for x, count in Counter(parser.ids).items() if count > 1]
        if dup:
            fail(f"IDs duplicados em {page.name}: {', '.join(dup)}")
        if parser.inline_handlers:
            fail(f"event handlers inline em {page.name}: {parser.inline_handlers[:4]}")
        if parser.inline_scripts:
            fail(f"script inline em {page.name}; CSP usa script-src 'self'")
        for ref in parser.refs:
            if ref.startswith(("http://", "https://", "mailto:", "tel:", "#", "data:", "javascript:")):
                continue
            ref = ref.split("#", 1)[0].split("?", 1)[0]
            if not ref:
                continue
            target = (page.parent / ref).resolve()
            try:
                target.relative_to(ROOT.resolve())
            except ValueError:
                continue
            if not target.exists():
                missing.append(f"{page.name} -> {ref}")
    if missing:
        fail("referências locais ausentes: " + "; ".join(missing))
    print(f"[ok] HTML/referências/CSP ({len(htmls)} páginas)")


def check_secrets() -> None:
    scan_ext = {".js", ".html", ".css", ".md", ".sql", ".toml", ".txt", ".yml", ".yaml"}
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in scan_ext:
            continue
        if path.name == "MANIFEST-SHA256.txt":
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                fail(f"possível segredo/token encontrado em {path.relative_to(ROOT)}")
    print("[ok] varredura básica de segredos")


def check_worker_markers() -> None:
    text = (ROOT / "publisher-worker/worker.js").read_text(encoding="utf-8")
    markers = [
        "/staff/password", "/staff/email/verify", "/staff/totp/verify",
        "reset-security", "accept\\/start", "accept\\/verify",
        "/admin/audit-log", "data_export", "adminQuoteStatus", "adminSupportStatus",
    ]
    for marker in markers:
        if marker not in text:
            fail(f"marcador crítico do Worker ausente: {marker}")
    print("[ok] rotas/permissões críticas do Worker")


def main() -> None:
    check_structure()
    check_js()
    check_worker_copy()
    check_schema()
    check_html()
    check_secrets()
    check_worker_markers()
    print("VALIDAÇÃO G-HOST: OK")

if __name__ == "__main__":
    main()
