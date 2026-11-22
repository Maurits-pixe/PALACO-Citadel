"""RIO v1.2 witness HTTP adapter — LOCAL DEVELOPMENT ONLY / HOLD.

Not a publicly deployable service. Bind to 127.0.0.1 exclusively; place
behind independently managed mTLS, network ACLs, throttling and supervision
before considering staging. No CORS, cookies, or authorization endpoints.
Only signed producer proposals are accepted. This adapter holds no identity
or user data and returns generic failures.
"""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import sqlite3
from pathlib import Path
from typing import Mapping

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from visitcard_witness_registry import publish

MAX_REQUEST_BYTES = 4096
MAX_RESPONSE_BYTES = 4096


def make_handler(db_path: str, producer_keys: Mapping[str, bytes],
                 witness_private_key: Ed25519PrivateKey, witness_id: str):
    """Development handler factory; never expose directly to the internet."""
    class WitnessHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, format, *args):
            # Do not log signed payloads or personal identifiers.
            return

        def respond(self, code: int, payload: dict):
            raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            if len(raw) > MAX_RESPONSE_BYTES:
                code, raw = 500, b'{"error":"internal"}'
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(raw)
            self.close_connection = True

        def do_POST(self):
            if self.path != "/v1/witness/receipts":
                self.respond(404, {"error": "not_found"})
                return
            header = self.headers.get("Content-Length")
            content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
            if content_type != "application/json" or not header or not header.isdecimal():
                self.respond(400, {"error": "invalid_request"})
                return
            size = int(header)
            if not 0 < size <= MAX_REQUEST_BYTES:
                self.respond(413, {"error": "invalid_size"})
                return
            try:
                raw = self.rfile.read(size)
                if len(raw) != size:
                    self.respond(400, {"error": "invalid_request"})
                    return
                proposal = json.loads(raw)
                if not isinstance(proposal, dict):
                    self.respond(400, {"error": "invalid_request"})
                    return
                with sqlite3.connect(db_path, isolation_level=None, timeout=1) as db:
                    receipt = publish(db, proposal, producer_keys, witness_private_key,
                                      witness_id=witness_id)
                if receipt is None:
                    self.respond(409, {"error": "rejected"})
                    return
                self.respond(200, receipt)
            except (OSError, sqlite3.Error, UnicodeDecodeError, json.JSONDecodeError, ValueError):
                self.respond(400, {"error": "invalid_request"})

        def do_GET(self):
            self.respond(405, {"error": "method_not_allowed"})

        def do_PUT(self):
            self.respond(405, {"error": "method_not_allowed"})

        def do_DELETE(self):
            self.respond(405, {"error": "method_not_allowed"})

    return WitnessHandler


def local_server(db_path: str, producer_keys: Mapping[str, bytes],
                 witness_private_key: Ed25519PrivateKey, witness_id: str,
                 *, port: int = 8766) -> ThreadingHTTPServer:
    """Explicit loopback-only server; no automatic startup or migrations."""
    if not Path(db_path).is_file():
        raise ValueError("witness database must be provisioned first")
    if not 1 <= port <= 65535:
        raise ValueError("invalid port")
    return ThreadingHTTPServer(
        ("127.0.0.1", port),
        make_handler(db_path, producer_keys, witness_private_key, witness_id),
    )
