"""RIO v1.3 loopback witness transport client — DRAFT / HOLD.

No automatic retries: after a timeout the publication state is ambiguous.
The caller must explicitly retry the IDENTICAL signed proposal after reconciling
the outstanding operation. Verify the signed receipt and exact expected head
before considering a local witness publication acknowledged. No authorization.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import http.client
import ipaddress
import json
from typing import Any

from visitcard_witness_receipt import WitnessTrust, VerifiedReceipt, verify_witness_receipt


class DeliveryState(str, Enum):
    ACKNOWLEDGED = "ACKNOWLEDGED"
    PENDING = "PENDING"  # Timeout, lost response or unknown server state
    REJECTED = "REJECTED"  # Invalid / conflicting proposal or invalid receipt


@dataclass(frozen=True)
class DeliveryResult:
    state: DeliveryState
    receipt: VerifiedReceipt | None = None


def _loopback(host: str) -> bool:
    try:
        # No DNS, redirects or hostnames: exact IPv4 localhost only.
        return host == "127.0.0.1" and ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def submit_local_witness(
    proposal: Any,
    witness_trust: WitnessTrust,
    *,
    expected_issuer: str,
    host: str = "127.0.0.1",
    port: int = 8766,
    timeout_seconds: float = 2.0,
) -> DeliveryResult:
    """Send exactly once, no redirect, and cryptographically bind response.

    Signed producer proposal is a bounded data-only object. A server response
    cannot advance local durable checkpoints; this function does no writes.
    """
    pending = DeliveryResult(DeliveryState.PENDING)
    rejected = DeliveryResult(DeliveryState.REJECTED)
    if not _loopback(host) or type(port) is not int or not 1 <= port <= 65535:
        return rejected
    if not isinstance(timeout_seconds, (int, float)) or isinstance(timeout_seconds, bool) or not 0 < timeout_seconds <= 10:
        return rejected
    if not isinstance(proposal, dict) or set(proposal) != {"payload", "signature"}:
        return rejected
    payload = proposal.get("payload")
    if not isinstance(payload, dict) or set(payload) != {"version", "issuer", "sequence", "entry_hash", "predecessor_hash"}:
        return rejected
    if payload.get("issuer") != expected_issuer or type(payload.get("sequence")) is not int:
        return rejected
    if payload["sequence"] <= 0 or not isinstance(payload.get("entry_hash"), str) or len(payload["entry_hash"]) != 64:
        return rejected
    try:
        body = json.dumps(proposal, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
        if not 0 < len(body) <= 4096:
            return rejected
        conn = http.client.HTTPConnection(host, port, timeout=timeout_seconds)
        try:
            conn.request("POST", "/v1/witness/receipts", body=body,
                         headers={"Content-Type": "application/json", "Accept": "application/json",
                                  "Connection": "close"})
            response = conn.getresponse()
            if response.status != 200:
                # 409 is a known rejection. 5xx means it might have committed;
                # never interpret it as safe failure or automatically retry.
                return rejected if response.status in (400, 404, 405, 409, 413) else pending
            declared = response.getheader("Content-Length")
            if declared is not None and (not declared.isdecimal() or int(declared) > 4096):
                return rejected
            raw = response.read(4097)
            if len(raw) > 4096:
                return rejected
            result = json.loads(raw)
        finally:
            conn.close()
        receipt = verify_witness_receipt(result, witness_trust, expected_issuer=expected_issuer)
        if receipt is None:
            return rejected
        if receipt.head.sequence != payload["sequence"] or receipt.head.entry_hash != payload["entry_hash"]:
            return rejected
        return DeliveryResult(DeliveryState.ACKNOWLEDGED, receipt)
    except (OSError, TimeoutError, http.client.HTTPException):
        return pending
    except (ValueError, TypeError, UnicodeError, json.JSONDecodeError):
        return rejected
