#!/usr/bin/env bash
# Test harness for the hooks/pre-push verdict parser.
#
# Runs the real hook inside a throwaway git repo with a fake `codex` CLI
# that replays a fixture response, then asserts the hook's exit code.
# This pins the fail-closed contract:
#   - BLOCKED wins over APPROVED when both markers appear
#   - markers only count at the start of a line (quoted instructions and
#     "NOT APPROVED:" are not verdicts)
#   - no verdict blocks the push
#
# Usage: hooks/pre-push.test.sh [path-to-hook]   (default: hooks/pre-push)

set -u

if [ $# -ge 1 ]; then
    HOOK="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
else
    HOOK="$(cd "$(dirname "$0")" && pwd)/pre-push"
fi

if [ ! -f "$HOOK" ]; then
    echo "hook not found: $HOOK" >&2
    exit 2
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Fake codex CLI: ignores its arguments, consumes stdin, replays a fixture.
mkdir -p "$WORK/bin" "$WORK/fixtures"
cat > "$WORK/bin/codex" <<'FAKE'
#!/usr/bin/env bash
cat > /dev/null          # consume the review request from stdin
cat "$CODEX_FIXTURE"     # replay the canned review response
FAKE
chmod +x "$WORK/bin/codex"

# Sandbox repo with a diff between origin/main and HEAD so the hook
# actually reaches the review/parse path.
REPO="$WORK/repo"
git init -q -b main "$REPO"
git -C "$REPO" -c user.name=test -c user.email=test@example.invalid \
    commit -q --allow-empty -m "base"
git -C "$REPO" update-ref refs/remotes/origin/main HEAD
echo "change" > "$REPO/file.txt"
git -C "$REPO" add file.txt
git -C "$REPO" -c user.name=test -c user.email=test@example.invalid \
    commit -q -m "change"

# --- Fixtures -------------------------------------------------------------

cat > "$WORK/fixtures/plain_approved.txt" <<'EOF'
The change looks good. Minor style nit in file.txt, not blocking.

APPROVED: No blocking issues found
EOF

cat > "$WORK/fixtures/plain_blocked.txt" <<'EOF'
The diff introduces a path traversal in file.txt.

BLOCKED: Critical issues must be fixed
EOF

cat > "$WORK/fixtures/mixed_markers.txt" <<'EOF'
APPROVED: No blocking issues found

...wait, on second look the auth check is bypassed:

BLOCKED: Critical issues must be fixed
EOF

cat > "$WORK/fixtures/not_approved.txt" <<'EOF'
NOT APPROVED: the error handling swallows failures; fix before pushing.
EOF

cat > "$WORK/fixtures/no_verdict.txt" <<'EOF'
Here are some thoughts on the diff. The naming could be clearer and the
timeout constant deserves a comment. Overall reasonable work.
EOF

cat > "$WORK/fixtures/quoted_instructions_only.txt" <<'EOF'
Per the instructions, I must end with one of:
- `APPROVED: No blocking issues found` - Push will proceed
- `BLOCKED: Critical issues must be fixed` - Push will be rejected

I could not complete the review because the diff was truncated.
EOF

cat > "$WORK/fixtures/quoted_then_real_approval.txt" <<'EOF'
The instructions ask for `APPROVED:` or `BLOCKED: Critical issues must be
fixed` as a final marker. Review found nothing blocking.

APPROVED: No blocking issues found
EOF

# --- Runner ---------------------------------------------------------------

pass=0
fail=0

run_case() {
    local name="$1" expected="$2"
    local actual=0
    (
        cd "$REPO" &&
        PATH="$WORK/bin:$PATH" CODEX_FIXTURE="$WORK/fixtures/$name.txt" \
            bash "$HOOK" origin https://example.invalid/repo.git
    ) > "$WORK/out_$name.log" 2>&1 || actual=$?

    if [ "$actual" -eq "$expected" ]; then
        echo "PASS  $name (exit $actual)"
        pass=$((pass + 1))
    else
        echo "FAIL  $name (expected exit $expected, got $actual)"
        sed 's/^/      | /' "$WORK/out_$name.log"
        fail=$((fail + 1))
    fi
}

# name                          expected exit
run_case plain_approved         0
run_case plain_blocked          1
run_case mixed_markers          1
run_case not_approved           1
run_case no_verdict             1
run_case quoted_instructions_only 1
run_case quoted_then_real_approval 0

echo ""
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
