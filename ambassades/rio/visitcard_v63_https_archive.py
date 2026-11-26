"""RIO v6.3 restricted HTTPS transport for v6.2 archive handoff.

A transport adapter, NOT an operational pair of archive services. Endpoints,
read/write credentials and Ed25519 trust anchors come from a trusted caller.
No network access or key issuance is triggered by importing this module.
A remote archive must enforce handoff_id idempotency and independently
persist evidence before returning a signed v6.1 archive receipt.
GO-13 DRAFT / HOLD / DENY.
"""
from __future__ import annotations

import ipaddress
import json
import re
import ssl
from typing import Any,Callable,Mapping
from urllib import request
from urllib.parse import urlsplit

from visitcard_release_review import _hex
from visitcard_v61_archive_receipts import verify_archive_receipt
from visitcard_v62_handoff import SCOPE as HANDOFF_SCOPE,_id,_request
from visitcard_witness_enrollment import _canonical

ENDPOINT_PATH="/v1/incident-handoffs"
MAX_RESPONSE=8192
MAX_REQUEST=8192
HOST=re.compile(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\Z",re.ASCII)
TOKEN=re.compile(r"[A-Za-z0-9._~+/-]{8,512}\Z",re.ASCII)


class _NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        return None


def _endpoint(url:Any)->bool:
    """Reject non-HTTPS, local or ambiguous URLs, authorities and paths."""
    try:
        if not isinstance(url,str) or len(url)>512 or any(ord(c)<33 or ord(c)>126 for c in url):
            return False
        p=urlsplit(url)
        if (p.scheme!="https" or not p.hostname or p.username is not None
            or p.password is not None or p.port not in (None,443)
            or p.query or p.fragment or p.path!=ENDPOINT_PATH
            or p.netloc.lower()!=p.hostname.lower()
            or p.hostname.lower()!=p.hostname or not HOST.fullmatch(p.hostname)):
            return False
        if p.hostname.endswith((".localhost",".local",".internal",".test",".invalid",".example")):
            return False
        if any(label.startswith("-") or label.endswith("-") or len(label)>63
               for label in p.hostname.split(".")):
            return False
        try:
            ipaddress.ip_address(p.hostname)
            return False
        except ValueError:
            pass
        return True
    except (TypeError,ValueError):
        return False


def _no_duplicates(pairs:list[tuple[str,Any]])->dict[str,Any]:
    result={}
    for key,value in pairs:
        if key in result:
            raise ValueError("duplicate JSON object key")
        result[key]=value
    return result


def _post_once(url:str,token:str,payload:bytes,handoff_id:str,
               transport:Callable[...,Any]|None=None)->dict[str,Any]:
    """One bounded POST; no auto redirect, no implicit retry."""
    if not _endpoint(url) or not TOKEN.fullmatch(token):
        raise ValueError("invalid endpoint or credential")
    if not 0<len(payload)<=MAX_REQUEST or not _hex(handoff_id):
        raise ValueError("invalid request")
    if transport is None:
        context=ssl.create_default_context()
        opener=request.build_opener(request.ProxyHandler({}),
                                    request.HTTPSHandler(context=context),_NoRedirect())
        transport=lambda req,timeout:opener.open(req,timeout=timeout)
    req=request.Request(url,method="POST",data=payload,headers={
        "Authorization":"Bearer "+token,
        "Content-Type":"application/json",
        "Accept":"application/json",
        "Idempotency-Key":handoff_id,
        "User-Agent":"PALACO-RIO-v6.3-archive-handoff",
    })
    with transport(req,timeout=8) as response:
        if response.status not in (200,201) or response.geturl()!=url:
            raise ValueError("bad response status or redirect")
        content_type=response.headers.get("Content-Type","").split(";",1)[0].strip().lower()
        if content_type!="application/json":
            raise ValueError("bad content-type")
        announced=response.headers.get("Content-Length")
        if announced is not None and (
            not announced.isascii() or not announced.isdecimal()
            or int(announced)>MAX_RESPONSE
        ):
            raise ValueError("oversized response")
        raw=response.read(MAX_RESPONSE+1)
    if len(raw)>MAX_RESPONSE:
        raise ValueError("oversized response")
    obj=json.loads(raw,object_pairs_hook=_no_duplicates)
    if not isinstance(obj,dict) or set(obj)!={"handoff_id","receipt"}:
        raise ValueError("invalid response envelope")
    if obj["handoff_id"]!=handoff_id:
        raise ValueError("idempotency mismatch")
    return obj


def make_archive_transport(*,
    endpoint_by_archive:Mapping[str,str],
    token_by_archive:Mapping[str,str],
    pinned_archive_keys:Mapping[str,bytes],
    now:Any=None,
    transport:Callable[...,Any]|None=None,
)->Callable[[dict[str,Any]],Any]:
    """Construct a v6.2-compatible callback from separately trusted config.

    The returned callback raises on bad transport/receipt. v6.2 leaves that
    archive pending; no attempt to override quarantine or activate anything.
    """
    if (not isinstance(endpoint_by_archive,Mapping)
        or not isinstance(token_by_archive,Mapping)
        or not isinstance(pinned_archive_keys,Mapping)
        or len(endpoint_by_archive)!=2
        or set(endpoint_by_archive)!=set(token_by_archive)
        or set(endpoint_by_archive)!=set(pinned_archive_keys)):
        raise ValueError("exactly two pinned archive identities required")
    names=tuple(endpoint_by_archive)
    if (len(names)!=2 or names[0]==names[1]
        or any(not isinstance(name,str) or not 1<=len(name)<=128 for name in names)
        or any(not _endpoint(endpoint_by_archive[name]) for name in names)
        or endpoint_by_archive[names[0]]==endpoint_by_archive[names[1]]
        or any(not isinstance(token_by_archive[name],str)
               or TOKEN.fullmatch(token_by_archive[name]) is None for name in names)
        or any(not isinstance(pinned_archive_keys[name],bytes)
               or len(pinned_archive_keys[name])!=32 for name in names)
        or pinned_archive_keys[names[0]]==pinned_archive_keys[names[1]]):
        raise ValueError("ambiguous or untrusted remote archive configuration")
    endpoints=dict(endpoint_by_archive)
    tokens=dict(token_by_archive)
    keys=dict(pinned_archive_keys)

    def send(item:dict[str,Any])->Any:
        if not isinstance(item,dict) or set(item)!={
            "handoff_id","version","scope","archive_id","incident_sequence",
            "incident_head_sha256","conflict_sha256","go13"
        }:
            raise ValueError("invalid handoff envelope")
        archive=item["archive_id"]
        if archive not in endpoints or item["scope"]!=HANDOFF_SCOPE or item["go13"]!="HOLD":
            raise ValueError("invalid archive scope")
        seq=item["incident_sequence"]
        if type(seq) is not int or seq<1:
            raise ValueError("invalid incident sequence")
        if (not _hex(item["incident_head_sha256"])
            or not _hex(item["conflict_sha256"])):
            raise ValueError("invalid incident reference")
        expected=_request(seq,item["incident_head_sha256"],item["conflict_sha256"],archive)
        if type(item["version"]) is not int or item!={
            "handoff_id":item["handoff_id"],**expected
        } or item["handoff_id"]!=_id(expected):
            raise ValueError("noncanonical handoff ID or request")
        body=_canonical(item)
        reply=_post_once(endpoints[archive],tokens[archive],body,item["handoff_id"],
                         transport=transport)
        receipt=reply["receipt"]
        if verify_archive_receipt(
            receipt,keys,expected_archive_id=archive,
            expected_incident_sequence=seq,
            expected_incident_head_sha256=item["incident_head_sha256"],
            expected_conflict_sha256=item["conflict_sha256"],
            now=now
        ) is None:
            raise ValueError("untrusted or wrong archive receipt")
        return receipt
    return send
