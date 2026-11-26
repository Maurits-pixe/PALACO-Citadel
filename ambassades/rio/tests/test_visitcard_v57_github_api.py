"""v5.7 offline HTTP fixture tests. No real GitHub token or network required."""
import io
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from visitcard_v57_github_api import ApiState,fetch_run_job_relationship,execution_permitted

REPO="Maurits-pixe/PALACO-Citadel"
SHA="a"*40
WORKFLOW=".github/workflows/rio-visitcard-draft-verification.yml"
RUN=123456
JOB=987654
TOKEN="test-only-credential"
RUN_DOC={"id":RUN,"run_attempt":1,"head_sha":SHA,"path":WORKFLOW,
         "status":"completed","conclusion":"success","repository":{"full_name":REPO}}
JOB_DOC={"id":JOB,"run_id":RUN,"status":"completed","conclusion":"success"}
JOBS_DOC={"total_count":1,"jobs":[JOB_DOC]}


class Response:
    def __init__(self,url,data,*,status=200,ctype="application/json",announced=None):
        self.status=status
        self._url=url
        self._data=io.BytesIO(json.dumps(data).encode() if not isinstance(data,bytes) else data)
        self.headers={"Content-Type":ctype}
        if announced is not None:
            self.headers["Content-Length"]=announced

    def __enter__(self): return self
    def __exit__(self,*args): pass
    def geturl(self): return self._url
    def read(self,n): return self._data.read(n)


class ApiAcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.run=json.loads(json.dumps(RUN_DOC))
        self.jobs=json.loads(json.dumps(JOBS_DOC))
        self.urls=[]
        self.credentials=[]

    def transport(self,req,timeout):
        self.urls.append(req.full_url)
        self.credentials.append(req.get_header("Authorization"))
        if "/jobs?" in req.full_url:
            return Response(req.full_url,self.jobs)
        return Response(req.full_url,self.run)

    def check(self,**change):
        return fetch_run_job_relationship(
            repository=change.get("repository",REPO),
            run_id=change.get("run_id",RUN),
            run_attempt=change.get("attempt",1),
            job_id=change.get("job_id",JOB),
            expected_commit_sha=change.get("sha",SHA),
            expected_workflow_path=change.get("workflow",WORKFLOW),
            token=change.get("token",TOKEN),
            transport=change.get("transport",self.transport),
        )

    def test_synthetic_metadata_is_only_informational(self):
        r=self.check()
        self.assertEqual(r.state,ApiState.API_OBSERVED_INFORMATIONAL)
        self.assertFalse(r.release_permitted)
        self.assertTrue(r.relationship_sha256)

    def test_two_exact_https_paths_only(self):
        self.check()
        self.assertEqual(len(self.urls),2)
        self.assertTrue(all(u.startswith("https://api.github.com/repos/"+REPO+"/actions/runs/") for u in self.urls))
        self.assertIn("/attempts/1/jobs?per_page=100&page=1",self.urls[1])

    def test_authentication_header_is_supplied_not_reported(self):
        r=self.check()
        self.assertEqual(self.credentials,[f"Bearer {TOKEN}"]*2)
        self.assertNotIn(TOKEN,str(r))

    def test_deterministic_relationship_digest(self):
        self.assertEqual(self.check().relationship_sha256,self.check().relationship_sha256)

    def test_changed_run_sha_blocks(self):
        self.run["head_sha"]="b"*40
        self.assertEqual(self.check().state,ApiState.BLOCKED)

    def test_wrong_run_id_blocks(self):
        self.assertEqual(self.check(run_id=123457).state,ApiState.BLOCKED)

    def test_job_not_member_blocks(self):
        self.jobs["jobs"][0]["id"]=111
        self.assertIn("JOB_NOT_MEMBER_OF_RUN_ATTEMPT",self.check().blockers)

    def test_wrong_job_parent_blocks(self):
        self.jobs["jobs"][0]["run_id"]=222
        self.assertEqual(self.check().state,ApiState.BLOCKED)

    def test_mismatched_attempt_blocks(self):
        self.run["run_attempt"]=2
        self.assertEqual(self.check().state,ApiState.BLOCKED)

    def test_job_attempt_mismatch_blocks(self):
        self.jobs["jobs"][0]["run_attempt"]=2
        self.assertEqual(self.check().state,ApiState.BLOCKED)

    def test_queued_job_blocks(self):
        self.jobs["jobs"][0]["status"]="queued"
        self.assertEqual(self.check().state,ApiState.BLOCKED)

    def test_failed_run_blocks(self):
        self.run["conclusion"]="failure"
        self.assertEqual(self.check().state,ApiState.BLOCKED)

    def test_repo_mismatch_blocks(self):
        self.run["repository"]["full_name"]="unknown/wrong"
        self.assertEqual(self.check().state,ApiState.BLOCKED)

    def test_workflow_mismatch_blocks(self):
        self.run["path"]=".github/workflows/other.yml"
        self.assertEqual(self.check().state,ApiState.BLOCKED)

    def test_missing_job_page_blocks(self):
        self.jobs["total_count"]=101
        self.assertIn("INCOMPLETE_ATTEMPT_JOB_LIST",self.check().blockers)

    def test_missing_job_blocks(self):
        self.jobs["jobs"]=[]
        self.assertEqual(self.check().state,ApiState.BLOCKED)

    def test_malformed_json_blocks(self):
        def broken(req,timeout): return Response(req.full_url,b"{not-json")
        self.assertEqual(self.check(transport=broken).state,ApiState.BLOCKED)

    def test_wrong_content_type_blocks(self):
        def html(req,timeout): return Response(req.full_url,self.run,ctype="text/html")
        self.assertEqual(self.check(transport=html).state,ApiState.BLOCKED)

    def test_redirect_blocks(self):
        def redirected(req,timeout): return Response("https://example.com",self.run)
        self.assertEqual(self.check(transport=redirected).state,ApiState.BLOCKED)

    def test_http_error_blocks(self):
        def fail(req,timeout): return Response(req.full_url,self.run,status=403)
        self.assertEqual(self.check(transport=fail).state,ApiState.BLOCKED)

    def test_oversized_response_blocks(self):
        def large(req,timeout): return Response(req.full_url,self.run,announced="999999999")
        self.assertEqual(self.check(transport=large).state,ApiState.BLOCKED)

    def test_token_missing_blocks_before_fetch(self):
        self.assertEqual(self.check(token="").state,ApiState.BLOCKED)
        self.assertEqual(self.urls,[])

    def test_token_with_newline_blocks(self):
        self.assertEqual(self.check(token="abc\n123456").state,ApiState.BLOCKED)

    def test_repo_path_injection_blocks(self):
        self.assertEqual(self.check(repository="../etc").state,ApiState.BLOCKED)

    def test_boolean_attempt_blocks(self):
        self.assertEqual(self.check(attempt=True).state,ApiState.BLOCKED)

    def test_boolean_run_id_blocks(self):
        self.assertEqual(self.check(run_id=True).state,ApiState.BLOCKED)

    def test_immutable_hold_always_false(self):
        from visitcard_v57_github_api import ApiReview
        for state in ApiState:
            r=ApiReview(state,(),None,None,None)
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
            self.assertFalse(execution_permitted(r))
