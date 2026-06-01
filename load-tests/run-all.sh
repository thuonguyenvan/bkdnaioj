#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if ! command -v k6 &>/dev/null; then
  echo "k6 not found. Install: brew install k6"
  exit 1
fi

mkdir -p results

echo "=== 01: Baseline ==="
k6 run k6/01-baseline.js --out json=results/01-baseline.json --summary-trend-stats='p(50),p(95),p(99),max'

echo "=== 02: Read Load ==="
k6 run k6/02-read-load.js --out json=results/02-read-load.json --summary-trend-stats='p(50),p(95),p(99),max'

echo "=== 03: Submit Wave ZHVI ==="
k6 run k6/03-submit-wave-zhvi.js --out json=results/03-zhvi.json --summary-trend-stats='p(50),p(95),p(99),max'

echo "=== 04: Submit Wave Sudoku ==="
k6 run k6/04-submit-wave-sudoku.js --out json=results/04-sudoku.json --summary-trend-stats='p(50),p(95),p(99),max'

echo "=== 05: Mixed Realistic ==="
k6 run k6/05-mixed-realistic.js --out json=results/05-mixed.json --summary-trend-stats='p(50),p(95),p(99),max'

echo ""
echo "Done. Results in load-tests/results/"
