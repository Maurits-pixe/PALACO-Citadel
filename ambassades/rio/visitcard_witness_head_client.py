"""RIO v1.7 loopback client for independently signed current witness head.

Fresh challenge is generated immediately before request; a valid signature,
matching challenge and issuer, and maximum age are mandatory. No untrusted
head grants access. No automatic outbox replay occurs in this module.
"""
from __future__ import annotations

from enum import Enum
import http.client
import json
from typing import Any

from visitcard_witness_client import _loopback
from visitcard_witness_head import new_challenge, verify_current_head
from visitcard_witness_receipt import WitnessTrust


class HeadDecision(str, Enum):
    ALREADY_WITNESSED = "ALREADY_WITNESSED"
    NEXT_PUBLICATION = "NEXT_PUBLICATION"
    CONFLICT = "CONFLICT"
    UNKNOWN = "UNKNOWN"


def read_current_head(
    trust: WitnessTrust, *, issuer: str,
    host: str = "127.0.0.1", port: int = 8766, timeout_seconds: float = 2.0
) -> tuple[int, str] | None:
    """Single challenge-response read from loopback; fail closed."""
    if not _loopback(host) or type(port) is not int or not 1 <= port <= 65535:
        return None
    if not isinstance(timeout_seconds, (int, float)) or isinstance(timeout_seconds, bool) or not 0 < timeout_seconds <= 10:
        return None
    if not isinstance(issuer, str) or not 0 < len(issuer) <= 128:
        return None
    challenge = new_challenge()
    body = json.dumps({"issuer":issuer, "challenge":challenge},separators=(",",":")).encode()
    connection = http.client.HTTPConnection(host,port,timeout=timeout_seconds)
    try:
        connection.request("POST","/v1/witness/head",body=body,headers={
            "Content-Type":"application/json","Accept":"application/json","Connection":"close"})
        response = connection.getresponse()
        if response.status != 200:
            return None
        content_length = response.getheader("Content-Length")
        if content_length is not None and (not content_length.isdecimal() or int(content_length)>4096):
            return None
        blob = response.read(4097)
        if len(blob)>4096:
            return None
        envelope = json.loads(blob)
        return verify_current_head(envelope,trust,issuer=issuer,challenge=challenge)
    except (OSError,TimeoutError,http.client.HTTPException,ValueError,TypeError,UnicodeError):
        return None
    finally:
        connection.close()


def assess_current_head(proposal: Any, current: tuple[int, str] | None) -> HeadDecision:
    """Compare witness head to exact requested sequence/hash, never authorize.

    No signed head exists for genesis. A genesis recovery requires a separately
    authenticated bootstrap ceremony, not this function's approval.
    """
    if current is None or not isinstance(proposal,dict) or not isinstance(proposal.get("payload"),dict):
        return HeadDecision.UNKNOWN
    payload=proposal["payload"]
    sequence=payload.get("sequence")
    head=payload.get("entry_hash")
    predecessor=payload.get("predecessor_hash")
    if type(sequence) is not int or sequence <= 0:
        return HeadDecision.UNKNOWN
    if not isinstance(head,str) or len(head)!=64 or not isinstance(predecessor,str) or len(predecessor)!=64:
        return HeadDecision.UNKNOWN
    if type(current[0]) is not int or current[0]<=0 or not isinstance(current[1],str) or len(current[1])!=64:
        return HeadDecision.UNKNOWN
    if current[0]==sequence:
        return HeadDecision.ALREADY_WITNESSED if current[1]==head else HeadDecision.CONFLICT
    if current[0]==sequence-1:
        return HeadDecision.NEXT_PUBLICATION if current[1]==predecessor else HeadDecision.CONFLICT
    return HeadDecision.CONFLICT
