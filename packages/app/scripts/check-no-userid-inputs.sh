#!/bin/bash
# CI Guardrail: Ensure no server functions accept userId from client inputs
#
# This script fails if any server function input type includes userId.
# The userId should always come from the authenticated session, not client input.

set -e

echo "Checking for userId in server function inputs..."

# Search for userId in server function input types
# This catches patterns like: { userId: string } in input validators
MATCHES=$(grep -rn "inputValidator\|validator:" packages/app/src/lib/server-functions/*.ts 2>/dev/null | grep -E "userId:\s*(string|z\.string)" || true)

if [ -n "$MATCHES" ]; then
  echo "ERROR: Found userId in server function inputs!"
  echo ""
  echo "The following lines contain userId in input types:"
  echo "$MATCHES"
  echo ""
  echo "Server functions should NEVER accept userId from client input."
  echo "Instead, get the user ID from the authenticated session:"
  echo ""
  echo "  const session = await getSessionOrThrow(request);"
  echo "  const userId = session.user.id;"
  echo ""
  exit 1
fi

echo "✓ No userId found in server function inputs"
exit 0
