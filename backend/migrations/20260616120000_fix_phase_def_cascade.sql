-- +goose Up
ALTER TABLE phases
  DROP CONSTRAINT phases_contest_phase_def_id_fkey,
  ADD CONSTRAINT phases_contest_phase_def_id_fkey
    FOREIGN KEY (contest_phase_def_id) REFERENCES contest_phase_defs(id) ON DELETE CASCADE;

-- +goose Down
ALTER TABLE phases
  DROP CONSTRAINT phases_contest_phase_def_id_fkey,
  ADD CONSTRAINT phases_contest_phase_def_id_fkey
    FOREIGN KEY (contest_phase_def_id) REFERENCES contest_phase_defs(id) ON DELETE RESTRICT;
