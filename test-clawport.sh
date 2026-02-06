#!/bin/bash

# Clawport Testing Script
# Usage: ./test-clawport.sh
# This script builds the CLI and runs a test creation sequence.
# It does NOT execute by default, as requested.

set -e

echo "=== Building Clawport ==="
pnpm --filter @ClawDock/clawport build

# Define test variables
TEST_AGENT_NAME="Test Agent Alpha"
TEST_AGENT_SLUG="test-agent-alpha"
DATA_DIR="./data"
AGENT_DIR="$DATA_DIR/$TEST_AGENT_SLUG"

# Clean up previous run if exists
if [ -d "$AGENT_DIR" ]; then
  echo "=== Cleaning up previous test run at $AGENT_DIR ==="
  rm -rf "$AGENT_DIR"
fi

echo "=== Testing 'clawport create' ==="
# We use node directly to run the built CLI
node packages/clawport/dist/index.js create "$TEST_AGENT_NAME"

echo "=== Verifying Creation ==="
if [ -d "$AGENT_DIR" ]; then
  echo "✅ Agent directory created at $AGENT_DIR"
else
  echo "❌ Agent directory missing!"
  exit 1
fi

if [ -f "$AGENT_DIR/docker-compose.yml" ]; then
  echo "✅ docker-compose.yml created"
  # Check if ports were allocated correctly (should be 8000 for first agent if free, or next block)
  if grep -q "8000:80" "$AGENT_DIR/docker-compose.yml"; then
     echo "✅ Port allocation logic appears correct (found 8000:80)"
  else
     echo "⚠️ Port 8000:80 not found - check if this is expected (maybe 8010?)"
     grep "80" "$AGENT_DIR/docker-compose.yml"
  fi
else
  echo "❌ docker-compose.yml missing!"
  exit 1
fi

if [ -d "$AGENT_DIR/.git" ]; then
  echo "✅ Git repository initialized"
else
  echo "❌ Git repository missing!"
  exit 1
fi

echo "=== Testing 'clawport list' ==="
node packages/clawport/dist/index.js list

echo "=== Test Complete ==="
echo "To test chat: node packages/clawport/dist/index.js chat $TEST_AGENT_SLUG"
echo "To clean up: rm -rf $AGENT_DIR"
