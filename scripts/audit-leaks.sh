#!/usr/bin/env bash
# Leak audit for a public checkout.
#
#   scripts/audit-leaks.sh [repo] [allowlist-regex]
#
# Two independent checks, both of which must come back empty:
#   1. absolute machine paths in tracked files
#   2. names from the private origin wordlist in tracked files
#
# The wordlists are local and gitignored on purpose: a tracked list of the names
# you are hiding would be the leak it exists to prevent.
#
#   Maintain/Configuration/Local/Origin.txt         every content origin
#   Maintain/Configuration/Local/Origin.public.txt  the subset that is also a
#                                                   public namespace, allowed
#
# `allowlist-regex` is an ERE of tracked paths to excuse - scaffolding the fork
# inherited and the owner has not reviewed yet. Default excuses only Update.sh.
#
# Exit 0 clean, 1 leaks present, 2 bad usage / not a repo.
set -u

REPO=${1:-$(cd "$(dirname "$0")/.." && pwd)}
ALLOW=${2:-'^Update\.sh$'}
cd "$REPO" 2>/dev/null || { echo "FAIL cannot cd $REPO"; exit 2; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "FAIL not a git repo: $REPO"; exit 2; }

# The pattern is assembled from pieces so this file cannot match itself: a
# checker that spells the forbidden form is the first thing it would flag.
# `file:///` is anchored to an ASCII letter so prose that QUOTES the form stays
# out of the result; a slash-prefixed root is matched as written.
SCHEME='file:///'
ROOT='/'
PATTERN="${SCHEME}[A-Za-z]|${ROOT}Users/[a-z]|${ROOT}Volumes/|${ROOT}home/[a-z]"
ORIGIN=Maintain/Configuration/Local/Origin.txt
PUBLIC=Maintain/Configuration/Local/Origin.public.txt
fail=0

echo "== absolute machine paths (allowlist: $ALLOW)"
hits=$(git grep -lE "$PATTERN" -- . 2>/dev/null | grep -vE "$ALLOW")
if [ -z "$hits" ]; then
	echo "PASS none"
else
	printf 'FAIL %s\n' "$hits"
	fail=1
fi

echo "== private origins"
if [ ! -f "$ORIGIN" ]; then
	echo "SKIP no local wordlist ($ORIGIN) - this check only runs where the wordlist exists"
else
	private=$(mktemp)
	public=$(mktemp)
	tr '[:upper:]' '[:lower:]' <"$ORIGIN" | grep -v '^[[:space:]]*$' | sort -u >"$private"
	if [ -f "$PUBLIC" ]; then
		tr '[:upper:]' '[:lower:]' <"$PUBLIC" | grep -v '^[[:space:]]*$' | sort -u >"$public"
		comm -23 "$private" "$public" >"$private.only"
		mv "$private.only" "$private"
	fi
	rm -f "$public"
	hits=$(git ls-files -z | xargs -0 grep -ilF -f "$private" 2>/dev/null | grep -vE "$ALLOW")
	rm -f "$private"
	if [ -z "$hits" ]; then
		echo "PASS none"
	else
		printf 'FAIL %s\n' "$hits"
		fail=1
	fi
fi

echo '---'
if [ "$fail" -eq 0 ]; then echo 'RESULT clean'; else echo 'RESULT leaks present'; fi
exit "$fail"
