"""RIO v6.6 HTTPS byte readback adapter for v6.5 exact comparison.

Only a caller-pinned pair of distinct archive URLs and credentials may be
used. The request binds the archive, challenge, handoff, incident head and
evidence SHA-256; the response must echo scope in headers, have a bounded
body and match the expected hash. Signed v6.4 status checking remains a
separate *mandatory* precondition of the v6.5 inspector. A response from an
injected test transport is NOT proof of independent physical custody.

No configured real endpoints, TLS client certificates or external archives
are provisioned here. GO-13 DRAFT/HOLD/DENY.
"""
from __future__ import annotations

import hashlib
import ssl
from typing import Any,Callable,Mapping
from urllib import request
from urllib.parse import urlsplit

from visitcard_release_review import _hex
from visitcard_v62_handoff import _request,_id
from visitcard_v63_https_archive import _endpoint,TOKEN,_NoRedirect
from visitcard_v64_archive_status import _base64
from visitcard_v65_exact_readback import MAX_READBACK
from visitcard_witness_enrollment import _canonical

ENDPOINT_PATH="/v1/incident-readback"
MAX_REQUEST=2048


def _readback_endpoint(url:Any)->bool:
    """Reuse the v6.3 validated HTTPS authority for a fixed readback path."""
    if not isinstance(url,str):
        return False
    try:
        parsed=urlsplit(url)
        if parsed.path!=ENDPOINT_PATH or parsed.query or parsed.fragment:
            return False
        # Validate the complete original authority with the prior strict
        # parser, changing only the route into the previously allowed path.
        alternative=url.replace(ENDPOINT_PATH,"/v1/incident-handoffs")
        return _endpoint(alternative)
    except (TypeError,ValueError):
        return False


def _request_readback(item:Any)->tuple[str,bytes]:
    if not isinstance(item,dict) or set(item)!={
        "version","archive_id","challenge","incident_sequence",
        "incident_head_sha256","conflict_sha256","evidence_sha256",
        "max_bytes","go13"
    }:
        raise ValueError("invalid readback request fields")
    archive=item["archive_id"]
    if (type(item["version"]) is not int or item["version"]!=1
        or not isinstance(archive,str) or not 1<=len(archive)<=128
        or _base64(item["challenge"]) is None
        or type(item["incident_sequence"]) is not int
        or item["incident_sequence"]<1
        or type(item["max_bytes"]) is not int
        or item["max_bytes"]!=MAX_READBACK
        or item["go13"]!="HOLD"
        or not all(_hex(item[key]) for key in (
            "incident_head_sha256","conflict_sha256","evidence_sha256"
        ))):
        raise ValueError("invalid readback request context")
    source=_request(item["incident_sequence"],item["incident_head_sha256"],
                    item["conflict_sha256"],archive)
    hid=_id(source)
    outbound={
        "version":1,"scope":"RIO-VISITCARD-V6.6-READBACK",
        "archive_id":archive,"challenge":item["challenge"],
        "handoff_id":hid,"incident_sequence":item["incident_sequence"],
        "incident_head_sha256":item["incident_head_sha256"],
        "conflict_sha256":item["conflict_sha256"],
        "evidence_sha256":item["evidence_sha256"],"go13":"HOLD"
    }
    raw=_canonical(outbound)
    if not 0<len(raw)<=MAX_REQUEST:
        raise ValueError("readback request exceeds bound")
    return hid,raw


def _post_readback(url:str,token:str,packet:bytes,*,archive_id:str,
    handoff_id:str,challenge:str,expected_sha256:str,
    transport:Callable[...,Any]|None=None,
)->bytes:
    if (not _readback_endpoint(url) or not isinstance(token,str)
        or TOKEN.fullmatch(token) is None):
        raise ValueError("readback endpoint or credential invalid")
    if transport is None:
        context=ssl.create_default_context()
        opener=request.build_opener(
            request.ProxyHandler({}),request.HTTPSHandler(context=context),
            _NoRedirect()
        )
        transport=lambda req,timeout:opener.open(req,timeout=timeout)
    req=request.Request(url,method="POST",data=packet,headers={
        "Authorization":"Bearer "+token,"Content-Type":"application/json",
        "Accept":"application/octet-stream",
        "Idempotency-Key":handoff_id,
        "X-Rio-Challenge":challenge,
        "User-Agent":"PALACO-RIO-v6.6-archive-readback",
    })
    with transport(req,timeout=8) as response:
        if response.status!=200 or response.geturl()!=url:
            raise ValueError("unexpected readback status or redirect")
        content_type=response.headers.get("Content-Type","").split(";",1)[0].strip().lower()
        if content_type!="application/octet-stream":
            raise ValueError("readback is not raw bytes")
        for header,value in (
            ("X-Archive-Id",archive_id),("X-Handoff-Id",handoff_id),
            ("X-Rio-Challenge",challenge),("X-Evidence-Sha256",expected_sha256),
        ):
            if response.headers.get(header)!=value:
                raise ValueError("readback response has wrong archive context")
        announced=response.headers.get("Content-Length")
        if announced is not None and (
            not isinstance(announced,str) or not announced.isascii()
            or not announced.isdecimal() or not 1<=int(announced)<=MAX_READBACK
        ):
            raise ValueError("readback declared length exceeds bound")
        data=response.read(MAX_READBACK+1)
    if type(data) is not bytes or not 0<len(data)<=MAX_READBACK:
        raise ValueError("missing or oversized readback evidence")
    if hashlib.sha256(data).hexdigest()!=expected_sha256:
        raise ValueError("readback evidence hash mismatch")
    if announced is not None and len(data)!=int(announced):
        raise ValueError("truncated or extra readback bytes")
    return data


def make_https_readback(*,
    endpoint_by_archive:Mapping[str,str],
    token_by_archive:Mapping[str,str],
    pinned_archive_keys:Mapping[str,bytes],
    transport:Callable[...,Any]|None=None,
)->Callable[[dict[str,Any]],bytes]:
    """Provide v6.5 readback callback; v6.5 still verifies signed v6.4 status."""
    if (not isinstance(endpoint_by_archive,Mapping)
        or not isinstance(token_by_archive,Mapping)
        or not isinstance(pinned_archive_keys,Mapping)
        or len(endpoint_by_archive)!=2
        or set(endpoint_by_archive)!=set(token_by_archive)
        or set(endpoint_by_archive)!=set(pinned_archive_keys)):
        raise ValueError("exactly two independently pinned archive routes required")
    names=tuple(endpoint_by_archive)
    if (names[0]==names[1]
        or any(not isinstance(n,str) or not 1<=len(n)<=128 for n in names)
        or any(not _readback_endpoint(endpoint_by_archive[n]) for n in names)
        or endpoint_by_archive[names[0]]==endpoint_by_archive[names[1]]
        or any(not isinstance(token_by_archive[n],str)
               or TOKEN.fullmatch(token_by_archive[n]) is None for n in names)
        or any(not isinstance(pinned_archive_keys[n],bytes)
               or len(pinned_archive_keys[n])!=32 for n in names)
        or pinned_archive_keys[names[0]]==pinned_archive_keys[names[1]]):
        raise ValueError("unsafe archive readback configuration")
    endpoints=dict(endpoint_by_archive)
    tokens=dict(token_by_archive)

    def fetch(item:dict[str,Any])->bytes:
        hid,body=_request_readback(item)
        archive=item["archive_id"]
        if archive not in endpoints:
            raise ValueError("unexpected archive identity")
        return _post_readback(
            endpoints[archive],tokens[archive],body,archive_id=archive,
            handoff_id=hid,challenge=item["challenge"],
            expected_sha256=item["evidence_sha256"],transport=transport
        )
    return fetch
