# /// script
# dependencies = ["httpx"]
# ///
import os, base64, subprocess, sys, httpx

API = os.environ["PROMPTQL_PLATFORM_API_URL"] + "/v1/integration/__github/api.github.com"
H = {"Authorization": f"Bearer {os.environ['PROMPTQL_USER_JWT']}", "Accept": "application/vnd.github+json",
     "X-PromptQL-Description": "Create GitHub repo phone-parts-inventory and push the inventory app source code"}
REPO = "phone-parts-inventory"
c = httpx.Client(headers=H, timeout=60)

login = c.get(f"{API}/user").json()["login"]
r = c.post(f"{API}/user/repos", json={"name": REPO, "private": True, "description": "Phone Parts Inventory System (Spec v8.1) — React + Express + MySQL", "auto_init": True})
if r.status_code not in (201, 422): print(r.status_code, r.text); sys.exit(1)
print("repo:", r.status_code)

os.chdir("/workspace/phone-parts")
files = subprocess.check_output(["git", "ls-files", "--others", "--cached", "--exclude-standard"], text=True).split("\n") if os.path.isdir(".git") else None
if not files:
    files = []
    for root, dirs, fs in os.walk("."):
        dirs[:] = [d for d in dirs if d not in ("node_modules", "dist", "config", ".git")]
        for f in fs:
            if f.endswith(".log"): continue
            files.append(os.path.relpath(os.path.join(root, f), "."))
files = [f for f in files if f]

tree = []
for f in files:
    data = open(f, "rb").read()
    b = c.post(f"{API}/repos/{login}/{REPO}/git/blobs", json={"content": base64.b64encode(data).decode(), "encoding": "base64"}).json()
    tree.append({"path": f, "mode": "100755" if f.endswith(".sh") else "100644", "type": "blob", "sha": b["sha"]})
print("blobs:", len(tree))

ref = c.get(f"{API}/repos/{login}/{REPO}/git/ref/heads/main").json()
base_commit = ref["object"]["sha"]
t = c.post(f"{API}/repos/{login}/{REPO}/git/trees", json={"tree": tree}).json()
commit = c.post(f"{API}/repos/{login}/{REPO}/git/commits", json={"message": "Phone Parts Inventory v1: setup wizard, inventory, caisse, supplier debts, reports, i18n (en/ar/fr)", "tree": t["sha"], "parents": [base_commit]}).json()
u = c.patch(f"{API}/repos/{login}/{REPO}/git/refs/heads/main", json={"sha": commit["sha"], "force": True})
print("push:", u.status_code, f"https://github.com/{login}/{REPO}")