# Chapter 5 Experiment Toolkit

This directory contains production-safe tooling for collecting the data used in
Chapter 5. The intended workflow is:

1. Clone a real system-testing contest into an isolated experiment contest.
2. Run a pilot workload and verify observability data.
3. Run the main workload with multiple volunteer workers.
4. Collect database and Prometheus metrics.
5. Simulate scheduler baselines from measured runtime data.
6. Generate tables and figures for the thesis.

All experiment data should use the `exp_ch5_` prefix so it can be filtered and
removed without touching real contest data.

## Required Environment

```bash
export DATABASE_URL='postgres://...'
export API_BASE_URL='https://api.bkdnaioj.app'
export ADMIN_EMAIL='...'
export ADMIN_PASSWORD='...'
```

Optional:

```bash
export METRICS_URL='https://api.bkdnaioj.app/metrics'
```

Python dependencies:

```bash
python -m pip install -r reports/experiments/requirements.txt
```

## Scripts

- `setup_experiment.py`: clone contest/tasks/phases/assets into a new
  experiment contest.
- `run_workload.py`: submit batches of output-only/final submissions through
  the public API.
- `collect_metrics.py`: export raw CSV and Markdown tables from PostgreSQL and
  Prometheus.
- `simulate_scheduler.py`: replay FIFO, Random, Capability-filtering and
  Measurement-driven strategies from measured runtime data.
- `make_figures.py`: generate PNG charts for Chapter 5.

## Safety Rules

- Never run destructive cleanup against production without reviewing the SQL.
- Prefer creating a fresh experiment contest per run.
- Do not use real contest IDs for workload submission.
- Keep all generated rows under an `exp_ch5_` slug/display prefix.
