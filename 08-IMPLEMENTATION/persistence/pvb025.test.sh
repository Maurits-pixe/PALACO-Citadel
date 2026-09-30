#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD=palaco-test
PSQL=(psql -h localhost -U palaco -d palaco -v ON_ERROR_STOP=1 -At)

# Baseline from PVB-024 is sequence 2 / hash-2.
# G-0100/G-0101: two concurrent writers race for sequence 3 and the same parent.
set +e
"${PSQL[@]}" -c "SELECT append_temporal_receipt(3,'race-A','hash-2','2026-06-01T00:00:02Z','{\"writer\":\"A\"}'::jsonb)" > /tmp/a.out 2>/tmp/a.err &
A=$!
"${PSQL[@]}" -c "SELECT append_temporal_receipt(3,'race-B','hash-2','2026-06-01T00:00:02Z','{\"writer\":\"B\"}'::jsonb)" > /tmp/b.out 2>/tmp/b.err &
B=$!
wait $A; RA=$?
wait $B; RB=$?
set -e
test $(( (RA==0) + (RB==0) )) -eq 1
test "$("${PSQL[@]}" -c "SELECT count(*) FROM temporal_ledger WHERE receipt_sequence=3")" = "1"
HEAD3=$("${PSQL[@]}" -c "SELECT head_receipt_hash FROM temporal_ledger_head WHERE singleton")
test "$HEAD3" = "race-A" -o "$HEAD3" = "race-B"

# G-0102: duplicate hash cannot create another ledger row/head.
set +e
"${PSQL[@]}" -c "SELECT append_temporal_receipt(4,'$HEAD3','$HEAD3','2026-06-01T00:00:03Z','{}'::jsonb)" >/tmp/dup.out 2>/tmp/dup.err
RD=$?
set -e
test $RD -ne 0
test "$("${PSQL[@]}" -c "SELECT highest_receipt_sequence FROM temporal_ledger_head WHERE singleton")" = "3"

# G-0103: explicit transaction abort leaves no partial receipt/head.
set +e
"${PSQL[@]}" <<SQL >/tmp/abort.out 2>/tmp/abort.err
BEGIN;
SELECT append_temporal_receipt(4,'abort-4','$HEAD3','2026-06-01T00:00:03Z','{}'::jsonb);
SELECT 1/0;
COMMIT;
SQL
RAB=$?
set -e
test $RAB -ne 0
test "$("${PSQL[@]}" -c "SELECT count(*) FROM temporal_ledger WHERE receipt_sequence=4")" = "0"
test "$("${PSQL[@]}" -c "SELECT highest_receipt_sequence || ':' || head_receipt_hash FROM temporal_ledger_head WHERE singleton")" = "3:$HEAD3"
echo "G-0100..G-0103 PASS"
