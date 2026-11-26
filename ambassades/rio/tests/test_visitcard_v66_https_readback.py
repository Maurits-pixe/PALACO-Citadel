"""RIO v6.6 offline HTTPS readback transport, strict headers and byte tests."""
import hashlib
import io
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_visitcard_v65_exact_readback import V65ExactReadbackTests,NOW
from visitcard_v62_handoff import _request,_id
from visitcard_v65_exact_readback import (
    MAX_READBACK,ReadbackState,inspect_exact_archive_readback,
)
from visitcard_v66_https_readback import (
    ENDPOINT_PATH,_readback_endpoint,make_https_readback,
)


class Response:
    def __init__(self,url,data,headers,*,status=200):
        self.status=status
        self.url=url
        self.headers=headers
        self.raw=io.BytesIO(data)
    def __enter__(self): return self
    def __exit__(self,*unused): return None
    def geturl(self): return self.url
    def read(self,size): return self.raw.read(size)


class V66HTTPSReadbackTests(unittest.TestCase):
    def setUp(self):
        self.f=V65ExactReadbackTests("test_exact_two_archive_bytes_are_information_only")
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.names=self.f.f.ids
        self.endpoints={
            self.names[0]:"https://archive-one.palaco.example.org"+ENDPOINT_PATH,
            self.names[1]:"https://archive-two.palaco.example.org"+ENDPOINT_PATH,
        }
        self.tokens={name:"synthetic-token-"+str(i) for i,name in enumerate(self.names)}
        self.calls=[]
        self.failed=set()
        self.mutated={}
        self.header_changes={}
        self.status=200
        self.redirect=False
        self.type="application/octet-stream"
        self.declared=None

    def transport(self,req,timeout):
        self.assertEqual(timeout,8)
        self.assertEqual(req.get_method(),"POST")
        packet=json.loads(req.data)
        name=packet["archive_id"]
        self.calls.append(name)
        self.assertEqual(req.get_header("Authorization"),"Bearer "+self.tokens[name])
        self.assertEqual(req.get_header("Idempotency-key"),packet["handoff_id"])
        self.assertEqual(req.get_header("X-rio-challenge"),packet["challenge"])
        if name in self.failed:
            raise ConnectionError("offline")
        data=self.mutated.get(name,self.f.original)
        headers={
            "Content-Type":self.type,
            "X-Archive-Id":name,
            "X-Handoff-Id":packet["handoff_id"],
            "X-Rio-Challenge":packet["challenge"],
            "X-Evidence-Sha256":packet["evidence_sha256"],
            "Content-Length":str(len(data)) if self.declared is None else self.declared
        }
        headers.update(self.header_changes)
        return Response(
            "https://unexpected.example.org"+ENDPOINT_PATH
            if self.redirect else req.full_url,
            data,headers,status=self.status
        )

    def adapter(self,**kw):
        return make_https_readback(
            endpoint_by_archive=kw.get("endpoints",self.endpoints),
            token_by_archive=kw.get("tokens",self.tokens),
            pinned_archive_keys=kw.get("keys",self.f.f.keys),
            transport=kw.get("transport",self.transport),
        )

    def verify(self,**kw):
        f=self.f.f
        def status(req): return kw.get("statuses",f.replies)[req["archive_id"]]
        return inspect_exact_archive_readback(
            f.db,pinned_custodian_keys=f.f.f.f.keys,
            pinned_archive_keys=f.keys,archive_ids=f.ids,incident_sequence=1,
            independently_pinned_incident_head_sha256=f.incident.head_sha256,
            expected_receipt_sequence=1,
            independently_pinned_receipt_head_sha256=f.final.receipt_head_sha256,
            challenge=f.chal,fetch_status=status,
            fetch_evidence=kw.get("callback",self.adapter()),now=NOW
        )

    def request(self,index=0):
        f=self.f.f
        name=self.names[index]
        return {
            "version":1,"archive_id":name,"challenge":f.chal,
            "incident_sequence":1,"incident_head_sha256":f.incident.head_sha256,
            "conflict_sha256":f.incident.conflict_sha256,
            "evidence_sha256":f.digest,"max_bytes":MAX_READBACK,"go13":"HOLD"
        }

    def test_two_tls_responses_match_exact_source(self):
        r=self.verify()
        self.assertEqual(r.state,ReadbackState.VERIFIED_INFORMATIONAL)
        self.assertEqual(r.archive_count,2)
        self.assertFalse(r.release_permitted)

    def test_both_archive_endpoints_called(self):
        self.verify()
        self.assertEqual(set(self.calls),set(self.names))

    def test_hash_and_expected_archive_are_both_bound(self):
        answer=self.adapter()(self.request())
        self.assertEqual(hashlib.sha256(answer).hexdigest(),self.f.f.digest)

    def test_deterministic_readback_comparison(self):
        self.assertEqual(self.verify().verification_sha256,
                         self.verify().verification_sha256)

    def test_second_archive_is_offline(self):
        self.failed.add(self.names[1])
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_first_archive_is_offline(self):
        self.failed.add(self.names[0])
        self.assertEqual(self.verify().archive_count,0)

    def test_one_byte_changed_is_rejected(self):
        self.mutated[self.names[1]]=self.f.original[:-1]+b"X"
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_truncated_body_rejected(self):
        self.mutated[self.names[1]]=self.f.original[:-1]
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_appended_body_rejected(self):
        self.mutated[self.names[1]]=self.f.original+b"X"
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_oversized_body_rejected(self):
        self.mutated[self.names[1]]=b"x"*(MAX_READBACK+1)
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_declared_length_too_large_rejected(self):
        self.declared=str(MAX_READBACK+1)
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_declared_length_mismatch_rejected(self):
        self.declared="1"
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_http_redirect_is_rejected(self):
        self.redirect=True
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_unexpected_status_rejected(self):
        self.status=206
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_html_response_rejected(self):
        self.type="text/html"
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_wrong_archive_identity_header_rejected(self):
        self.header_changes={"X-Archive-Id":"wrong-archive"}
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_wrong_handoff_header_rejected(self):
        self.header_changes={"X-Handoff-Id":"f"*64}
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_wrong_challenge_header_rejected(self):
        self.header_changes={"X-Rio-Challenge":"other"}
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_wrong_digest_header_rejected(self):
        self.header_changes={"X-Evidence-Sha256":"f"*64}
        self.assertEqual(self.verify().state,ReadbackState.READBACK_INCOMPLETE)

    def test_missing_archive_keys_rejected(self):
        with self.assertRaises(ValueError):
            self.adapter(keys={})

    def test_reused_archive_key_rejected(self):
        with self.assertRaises(ValueError):
            self.adapter(keys={name:self.f.f.keys[self.names[0]] for name in self.names})

    def test_same_endpoint_for_both_archives_rejected(self):
        with self.assertRaises(ValueError):
            self.adapter(endpoints={name:self.endpoints[self.names[0]] for name in self.names})

    def test_token_with_newline_rejected(self):
        tokens=dict(self.tokens)
        tokens[self.names[0]]="unsafe\ncredential"
        with self.assertRaises(ValueError):
            self.adapter(tokens=tokens)

    def test_non_https_endpoint_rejected(self):
        self.assertFalse(_readback_endpoint("http://archive.example.org"+ENDPOINT_PATH))

    def test_loopback_endpoint_rejected(self):
        self.assertFalse(_readback_endpoint("https://127.0.0.1"+ENDPOINT_PATH))

    def test_local_hostname_rejected(self):
        self.assertFalse(_readback_endpoint("https://archive.local"+ENDPOINT_PATH))

    def test_embedded_url_credentials_rejected(self):
        self.assertFalse(_readback_endpoint("https://u:p@archive.example.org"+ENDPOINT_PATH))

    def test_unexpected_port_rejected(self):
        self.assertFalse(_readback_endpoint("https://archive.example.org:8443"+ENDPOINT_PATH))

    def test_query_string_rejected(self):
        self.assertFalse(_readback_endpoint("https://archive.example.org"+ENDPOINT_PATH+"?x=1"))

    def test_wrong_readback_path_rejected(self):
        self.assertFalse(_readback_endpoint("https://archive.example.org/v1/readback"))

    def test_wrong_archive_request_rejected(self):
        bad=self.request()
        bad["archive_id"]="unknown"
        with self.assertRaises(ValueError): self.adapter()(bad)

    def test_changed_challenge_in_request_rejected(self):
        bad=self.request()
        bad["challenge"]="invalid"
        with self.assertRaises(ValueError): self.adapter()(bad)

    def test_boolean_incident_sequence_rejected(self):
        bad=self.request()
        bad["incident_sequence"]=True
        with self.assertRaises(ValueError): self.adapter()(bad)

    def test_noncanonical_request_field_rejected(self):
        bad=self.request()
        bad["release"]=True
        with self.assertRaises(ValueError): self.adapter()(bad)

    def test_no_status_proof_means_zero_readback_calls(self):
        self.verify(statuses={name:None for name in self.names})
        self.assertEqual(self.calls,[])

    def test_never_grants_merge_or_activation(self):
        r=self.verify()
        self.assertFalse(r.merge_permitted)
        self.assertFalse(r.activation_permitted)
