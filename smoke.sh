#!/bin/bash
# End-to-end smoke test against a fresh DB
set -e
B=http://localhost:8080/api
J=/tmp/pp_cookies; rm -f $J
op() { python3 -c "import uuid;print(uuid.uuid4())"; }
req() { curl -s -b $J -c $J -H 'Content-Type: application/json' "$@"; }
echo "--- status"; req $B/status; echo
echo "--- test conn"; req -X POST $B/setup/test-connection -d '{"host":"localhost","port":3306,"user":"shop","password":"Shop2026!","database":"phoneparts"}'; echo
echo "--- finish"; req -X POST $B/setup/finish -d '{"db":{"host":"localhost","port":3306,"user":"shop","password":"Shop2026!","database":"phoneparts"},"storeName":"Test Shop","capital":1000,"username":"admin","password":"admin123"}'; echo
echo "--- login"; req -X POST $B/auth/login -d '{"username":"admin","password":"admin123"}'; echo
echo "--- supplier"; S=$(req -X POST $B/suppliers -d "{\"name\":\"Ali Parts\",\"opId\":\"$(op)\"}"); echo $S; SID=$(echo $S | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "--- category"; req -X POST $B/categories -d "{\"name\":\"Screens\",\"opId\":\"$(op)\"}"; echo
echo "--- product (qty 2 @ cost 100)"; P=$(req -X POST $B/products -d "{\"name\":\"شاشة iPhone 12\",\"model\":\"iPhone 12\",\"categoryId\":1,\"cost\":100,\"sellingPrice\":180,\"quantity\":2,\"supplierId\":$SID,\"opId\":\"$(op)\"}"); echo $P; PID=$(echo $P | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "--- dup opId (idempotent)"; O=$(op); req -X POST $B/cash -d "{\"type\":\"expense\",\"amount\":50,\"description\":\"rent\",\"opId\":\"$O\"}"; echo; req -X POST $B/cash -d "{\"type\":\"expense\",\"amount\":50,\"description\":\"rent\",\"opId\":\"$O\"}"; echo
echo "--- restock 2 @ 120 -> avg should be 110"; req -X POST $B/products/$PID/restock -d "{\"supplierId\":$SID,\"qty\":2,\"unitCost\":120,\"opId\":\"$(op)\"}"; echo
echo "--- use paid"; S1=$(req -X POST $B/sales/use -d "{\"productId\":$PID,\"price\":180,\"clientName\":\"Sami\",\"paid\":true,\"opId\":\"$(op)\"}"); echo $S1
echo "--- use unpaid"; S2=$(req -X POST $B/sales/use -d "{\"productId\":$PID,\"price\":170,\"opId\":\"$(op)\"}"); echo $S2; SID2=$(echo $S2 | python3 -c "import sys,json;print(json.load(sys.stdin)['saleId'])")
echo "--- return paid sale (refund 180)"; SID1=$(echo $S1 | python3 -c "import sys,json;print(json.load(sys.stdin)['saleId'])"); req -X POST $B/sales/$SID1/return -d "{\"opId\":\"$(op)\"}"; echo
echo "--- pay unpaid sale"; req -X POST $B/sales/$SID2/pay -d "{\"opId\":\"$(op)\"}"; echo
echo "--- pay supplier 150 (FIFO)"; req -X POST $B/debts/$SID/pay -d "{\"amount\":150,\"opId\":\"$(op)\"}"; echo
echo "--- overpay -> 409"; req -X POST $B/debts/$SID/pay -d "{\"amount\":9999,\"opId\":\"$(op)\"}"; echo
echo "--- summary (expect balance=1000+170-180-50-150=790)"; req $B/caisse/summary; echo
echo "--- arabic search 'شاشه' (variant of شاشة)"; req "$B/search?q=شاشه"; echo
echo "--- debts"; req $B/debts; echo
echo "--- audit UPDATE should fail for app user"; sudo mysql phoneparts -e "SELECT user FROM mysql.user WHERE user LIKE 'pp_app%'"; APP=$(sudo mysql -N phoneparts -e "SELECT user FROM mysql.user WHERE user LIKE 'pp_app%' LIMIT 1"); sudo mysql -N -e "SHOW GRANTS FOR '$APP'@'localhost'" | grep -i audit
echo "--- report"; req "$B/reports?from=2026-10-01&to=2026-10-31&tzOffset=60"; echo
echo "--- readyz"; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/readyz