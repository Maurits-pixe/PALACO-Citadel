"""RIO v6.3 HTTPS archive handoff transport: offline security regressions."""
import io
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_visitcard_v62_handoff import V62HandoffTests,NOW
from visitcard_v62_handoff import _id,_request,HandoffState,deliver_handoffs
from visitcard_v63_https_archive import (
    ENDPOINT_PATH,_endpoint,_post_once,make_archive_transport,
)

class Response:
    def __init__(self,url,body,*,status=200,ctype="application/json",announced=None):
        self.status=status
        self.url=url
        self.headers={"Content-Type":ctype}
        if announced is not None:
            self.headers["Content-Length"]=announced
        self.io=io.BytesIO(
            json.dumps(body).encode() if not isinstance(body,bytes) else body
        )
    def __enter__(self): return self
    def __exit__(self,*unused): return None
    def geturl(self): return self.url
    def read(self,count): return self.io.read(count)


class V63TransportTests(unittest.TestCase):
    def setUp(self):
        self.f=V62HandoffTests("test_preparation_durable_and_quarantined")
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.endpoints={
            self.f.f.ids[0]:"https://archive-a.palaco.example.org"+ENDPOINT_PATH,
            self.f.f.ids[1]:"https://archive-b.palaco.example.org"+ENDPOINT_PATH,
        }
        self.tokens={name:"synthetic-test-token-"+str(i)
                     for i,name in enumerate(self.f.f.ids)}
        self.requests=[]
        self.fail=set()
        self.status=200
        self.ctype="application/json"
        self.wrong_url=False
        self.announced=None
        self.override=None

    def transport(self,req,timeout):
        self.requests.append(req)
        self.assertEqual(timeout,8)
        if req.full_url in self.fail:
            raise ConnectionError("simulated archive offline")
        body=json.loads(req.data)
        self.assertEqual(req.get_method(),"POST")
        self.assertEqual(req.get_header("Idempotency-key"),body["handoff_id"])
        self.assertEqual(req.get_header("Authorization"),
                         "Bearer "+self.tokens[body["archive_id"]])
        receipt=self.f.f.reply[body["archive_id"]]
        response={"handoff_id":body["handoff_id"],"receipt":receipt}
        if self.override is not None:
            response=self.override(response,body)
        return Response("https://wrong.example.org"+ENDPOINT_PATH
                        if self.wrong_url else req.full_url,response,
                        status=self.status,ctype=self.ctype,announced=self.announced)

    def adapter(self,**changes):
        return make_archive_transport(
            endpoint_by_archive=changes.get("endpoints",self.endpoints),
            token_by_archive=changes.get("tokens",self.tokens),
            pinned_archive_keys=changes.get("roots",self.f.f.keys),
            now=NOW,transport=changes.get("transport",self.transport),
        )

    def request(self,index=0):
        f=self.f.f
        archive=f.ids[index]
        packet=_request(f.incident.sequence,f.incident.head_sha256,
                        f.incident.conflict_sha256,archive)
        return {"handoff_id":_id(packet),**packet}

    def perform(self):
        self.f.prep()
        f=self.f.f
        return deliver_handoffs(
            f.f.one,incident_sequence=f.incident.sequence,
            independently_pinned_incident_head_sha256=f.incident.head_sha256,
            pinned_custodian_keys=f.f.f.keys,
            archive_ids=f.ids,pinned_archive_keys=f.keys,
            transport=self.adapter(),now=NOW,
        )

    def test_two_signed_responses_stay_quarantined(self):
        result=self.perform()
        self.assertEqual(result.state,HandoffState.BOTH_RECEIPTS_QUARANTINED)
        self.assertEqual(result.acknowledged,2)
        self.assertFalse(result.release_permitted)

    def test_two_distinct_pinned_https_endpoints(self):
        self.perform()
        self.assertEqual({r.full_url for r in self.requests},set(self.endpoints.values()))

    def test_idempotency_key_matches_request_digest(self):
        self.perform()
        for req in self.requests:
            item=json.loads(req.data)
            self.assertEqual(item["handoff_id"],_id({k:v for k,v in item.items()
                                                      if k!="handoff_id"}))

    def test_retry_only_failed_remote(self):
        self.f.prep()
        self.fail.add(self.endpoints[self.f.f.ids[1]])
        f=self.f.f
        cb=self.adapter()
        first=deliver_handoffs(f.f.one,incident_sequence=f.incident.sequence,
            independently_pinned_incident_head_sha256=f.incident.head_sha256,
            pinned_custodian_keys=f.f.f.keys,archive_ids=f.ids,
            pinned_archive_keys=f.keys,transport=cb,now=NOW)
        self.assertEqual(first.acknowledged,1)
        self.fail.clear()
        self.requests.clear()
        second=deliver_handoffs(f.f.one,incident_sequence=f.incident.sequence,
            independently_pinned_incident_head_sha256=f.incident.head_sha256,
            pinned_custodian_keys=f.f.f.keys,archive_ids=f.ids,
            pinned_archive_keys=f.keys,transport=cb,now=NOW)
        self.assertEqual(second.acknowledged,2)
        self.assertEqual(len(self.requests),1)

    def test_wrong_receipt_identity_fails_closed(self):
        self.override=lambda response,body:{
            **response,"receipt":self.f.f.receipts[1]}
        self.assertEqual(self.perform().acknowledged,1)

    def test_tampered_signature_fails_closed(self):
        def mutate(response,body):
            receipt=dict(response["receipt"],signature="A"*86)
            return {**response,"receipt":receipt}
        self.override=mutate
        self.assertEqual(self.perform().acknowledged,0)

    def test_wrong_idempotency_echo_fails_closed(self):
        self.override=lambda response,body:{**response,"handoff_id":"f"*64}
        self.assertEqual(self.perform().acknowledged,0)

    def test_redirect_is_not_followed(self):
        self.wrong_url=True
        self.assertEqual(self.perform().acknowledged,0)

    def test_unexpected_status_fails_closed(self):
        self.status=302
        self.assertEqual(self.perform().acknowledged,0)

    def test_wrong_content_type_fails_closed(self):
        self.ctype="text/html"
        self.assertEqual(self.perform().acknowledged,0)

    def test_oversized_response_fails_closed(self):
        self.announced="1000000"
        self.assertEqual(self.perform().acknowledged,0)

    def test_duplicate_json_keys_rejected(self):
        self.override=lambda response,body:(
            b'{"handoff_id":"'+body["handoff_id"].encode()+
            b'","handoff_id":"'+body["handoff_id"].encode()+b'","receipt":{}}')
        self.assertEqual(self.perform().acknowledged,0)

    def test_different_archive_public_keys_are_required(self):
        roots={key:self.f.f.keys[self.f.f.ids[0]] for key in self.f.f.ids}
        with self.assertRaises(ValueError):
            self.adapter(roots=roots)

    def test_two_distinct_endpoint_urls_required(self):
        endpoints={name:self.endpoints[self.f.f.ids[0]] for name in self.f.f.ids}
        with self.assertRaises(ValueError):
            self.adapter(endpoints=endpoints)

    def test_missing_credentials_rejected_before_network(self):
        with self.assertRaises(ValueError):
            self.adapter(tokens={})

    def test_bad_token_newline_rejected(self):
        tokens=dict(self.tokens)
        tokens[self.f.f.ids[0]]="bad\ncredential"
        with self.assertRaises(ValueError):
            self.adapter(tokens=tokens)

    def test_wrong_archive_request_rejected_before_network(self):
        bad=self.request()
        bad["archive_id"]="unexpected"
        with self.assertRaises(ValueError):
            self.adapter()(bad)

    def test_wrong_handoff_id_rejected_before_network(self):
        bad=self.request()
        bad["handoff_id"]="f"*64
        with self.assertRaises(ValueError):
            self.adapter()(bad)

    def test_incorrect_scope_rejected(self):
        bad=self.request()
        bad["scope"]="SCOPE-OTHER"
        with self.assertRaises(ValueError):
            self.adapter()(bad)

    def test_extra_fields_not_transmitted(self):
        bad=self.request()
        bad["production_authorization"]=True
        with self.assertRaises(ValueError):
            self.adapter()(bad)

    def test_boolean_incident_sequence_rejected(self):
        bad=self.request()
        bad["incident_sequence"]=True
        with self.assertRaises(ValueError):
            self.adapter()(bad)

    def test_plain_http_rejected(self):
        self.assertFalse(_endpoint("http://archive.example.org"+ENDPOINT_PATH))

    def test_loopback_ip_rejected(self):
        self.assertFalse(_endpoint("https://127.0.0.1"+ENDPOINT_PATH))

    def test_local_domain_rejected(self):
        self.assertFalse(_endpoint("https://archive.local"+ENDPOINT_PATH))

    def test_credentials_embedded_in_url_rejected(self):
        self.assertFalse(_endpoint("https://user:secret@archive.example.org"+ENDPOINT_PATH))

    def test_query_and_fragment_rejected(self):
        self.assertFalse(_endpoint("https://archive.example.org"+ENDPOINT_PATH+"?token=secret"))
        self.assertFalse(_endpoint("https://archive.example.org"+ENDPOINT_PATH+"#frag"))

    def test_wrong_url_path_rejected(self):
        self.assertFalse(_endpoint("https://archive.example.org/other"))

    def test_port_redirection_rejected(self):
        self.assertFalse(_endpoint("https://archive.example.org:8443"+ENDPOINT_PATH))

    def test_no_release_method_exists(self):
        self.assertNotIn("issue",dir(self.adapter()))
