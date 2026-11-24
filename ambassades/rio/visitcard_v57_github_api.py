"""PALACO RIO v5.7 GitHub Actions read-only API metadata acquisition.

Real HTTPS GET via pinned api.github.com origin (TLS certificate validation by
Python's default HTTPS stack), no redirects, bounded JSON, no credentials in
results. An injectable transport exists for deterministic OFFLINE tests; such
tests DO NOT attest real authenticated GitHub traffic or external key custody.

Uses run and attempt-scoped jobs endpoints. Never creates/updates GitHub state.
GO-13 HOLD, no merge/release/activation.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import hashlib
import json
import re
import ssl
from typing import Any, Callable, Mapping
from urllib import request, error
from urllib.parse import urlsplit

from visitcard_witness_enrollment import _canonical
from visitcard_v5_security_review import EXTERNAL_BLOCKERS

BASE="https://api.github.com"
REPO=re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z",re.ASCII)
MAX_BODY=256*1024


class ApiState(str,Enum):
    BLOCKED="BLOCKED"
    API_OBSERVED_INFORMATIONAL="API_OBSERVED_INFORMATIONAL"


@dataclass(frozen=True)
class ApiReview:
    state:ApiState
    blockers:tuple[str,...]
    run_metadata_sha256:str|None=None
    job_metadata_sha256:str|None=None
    relationship_sha256:str|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


class _NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        return None


def _github_get(path:str, token:str, *, transport:Callable[...,Any]|None=None)->dict[str,Any]:
    """Bounded HTTPS API response; only a fixed path built by the caller."""
    url=BASE+path
    if urlsplit(url).scheme!="https" or urlsplit(url).netloc!="api.github.com":
        raise ValueError("API origin mismatch")
    headers={
        "Authorization":"Bearer "+token,
        "Accept":"application/vnd.github+json",
        "X-GitHub-Api-Version":"2022-11-28",
        "User-Agent":"PALACO-RIO-v5.7-evidence-review",
    }
    if transport is None:
        context=ssl.create_default_context()
        opener=request.build_opener(request.HTTPSHandler(context=context),_NoRedirect())
        transport=lambda req,timeout:opener.open(req,timeout=timeout)
    response=transport(request.Request(url,headers=headers,method="GET"),timeout=8)
    with response as resp:
        if resp.status!=200 or resp.geturl()!=url:
            raise ValueError("unexpected HTTP response or redirect")
        content_type=resp.headers.get("Content-Type","").split(";",1)[0].strip().lower()
        if content_type!="application/json":
            raise ValueError("unexpected content type")
        announced=resp.headers.get("Content-Length")
        if announced is not None and (not announced.isdecimal() or int(announced)>MAX_BODY):
            raise ValueError("response exceeds bound")
        data=resp.read(MAX_BODY+1)
        if len(data)>MAX_BODY:
            raise ValueError("response exceeds bound")
    result=json.loads(data)
    if not isinstance(result,dict):
        raise ValueError("unexpected JSON root")
    return result


def fetch_run_job_relationship(*,repository:str,run_id:int,
    run_attempt:int,job_id:int,expected_commit_sha:str,
    expected_workflow_path:str,token:str,
    transport:Callable[...,Any]|None=None
)->ApiReview:
    """Read only run + *attempt-specific* job listing and enforce exact linkage.

    The fetcher does not declare production readiness: a third party must
    independently pin retrieved metadata and verify real-world job provenance.
    """
    def deny(code:str)->ApiReview:
        return ApiReview(ApiState.BLOCKED,tuple(sorted(set(EXTERNAL_BLOCKERS+(code,)))))
    if (not isinstance(repository,str) or not REPO.fullmatch(repository)
        or type(run_id) is not int or run_id<1
        or type(run_attempt) is not int or run_attempt<1
        or type(job_id) is not int or job_id<1
        or not isinstance(expected_commit_sha,str) or
        not re.fullmatch(r"[0-9a-f]{40}",expected_commit_sha)
        or not isinstance(expected_workflow_path,str)
        or not re.fullmatch(r"\.github/workflows/[A-Za-z0-9_.-]+\.ya?ml",expected_workflow_path)
        or not isinstance(token,str) or not 8<=len(token)<=512
        or any(c.isspace() or ord(c)<33 or ord(c)>126 for c in token)):
        return deny("INVALID_OR_MISSING_TRUST_INPUT")
    prefix="/repos/"+repository+"/actions/runs/"+str(run_id)
    try:
        run=_github_get(prefix,token,transport=transport)
        listed=_github_get(prefix+"/attempts/"+str(run_attempt)+"/jobs?per_page=100&page=1",
                           token,transport=transport)
        if (type(run.get("id")) is not int or run["id"]!=run_id
            or type(run.get("run_attempt")) is not int or run["run_attempt"]!=run_attempt
            or run.get("head_sha")!=expected_commit_sha
            or run.get("path")!=expected_workflow_path
            or run.get("status")!="completed" or run.get("conclusion")!="success"
            or not isinstance(run.get("repository"),dict)
            or run["repository"].get("full_name")!=repository):
            return deny("GITHUB_RUN_METADATA_MISMATCH")
        if (not isinstance(listed.get("total_count"),int)
            or type(listed["total_count"]) is not int
            or not 1<=listed["total_count"]<=100
            or not isinstance(listed.get("jobs"),list)
            or len(listed["jobs"])!=listed["total_count"]):
            # Fail closed rather than silently trusting one page of many.
            return deny("INCOMPLETE_ATTEMPT_JOB_LIST")
        jobs=listed["jobs"]
        if any(not isinstance(j,dict) or type(j.get("id")) is not int for j in jobs):
            return deny("JOB_LIST_INVALID")
        selected=[j for j in jobs if j["id"]==job_id]
        if len(selected)!=1:
            return deny("JOB_NOT_MEMBER_OF_RUN_ATTEMPT")
        job=selected[0]
        if (type(job.get("run_id")) is not int or job["run_id"]!=run_id
            or job.get("status")!="completed" or job.get("conclusion")!="success"
            or job.get("head_sha",expected_commit_sha)!=expected_commit_sha):
            return deny("GITHUB_JOB_METADATA_MISMATCH")
        # The attempt-scoped endpoint is the authoritative attempt association.
        # Check a job run_attempt if returned, do not require an undocumented field.
        if "run_attempt" in job and (
            type(job["run_attempt"]) is not int or job["run_attempt"]!=run_attempt
        ):
            return deny("GITHUB_JOB_ATTEMPT_MISMATCH")
        run_digest=hashlib.sha256(_canonical(run)).hexdigest()
        job_digest=hashlib.sha256(_canonical(job)).hexdigest()
        relationship=hashlib.sha256(_canonical({
            "version":1,"policy":"GO-13-HOLD",
            "repository":repository,"run_id":run_id,"run_attempt":run_attempt,
            "job_id":job_id,"head_sha":expected_commit_sha,
            "workflow_path":expected_workflow_path,
            "run_metadata_sha256":run_digest,"job_metadata_sha256":job_digest,
        })).hexdigest()
        return ApiReview(ApiState.API_OBSERVED_INFORMATIONAL,EXTERNAL_BLOCKERS,
                         run_digest,job_digest,relationship)
    except (error.HTTPError,error.URLError,TimeoutError,OSError,ssl.SSLError,
            ValueError,TypeError,KeyError,OverflowError,json.JSONDecodeError):
        return deny("GITHUB_API_ACQUISITION_FAILED")


def execution_permitted(result:ApiReview)->bool:
    return False
