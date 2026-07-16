#!/usr/bin/env bash

set -euo pipefail

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

test_types=${COMPARE_TEST_TYPES:-test test:integration}
compare_extensions=${COMPARE_EXTENSIONS:-opencode-tools pi-tools}

for test_type in $test_types; do
  for extension in $compare_extensions; do
    npm run "$test_type" --workspace "@harnessctl/$extension"
  done
done
