import React, { useState } from 'react';
import { BookOpen, ChevronRight, FileText, Server, Upload, Users } from 'lucide-react';

interface SectionDef {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

const CodeBlock: React.FC<{ children: string }> = ({ children }) => (
  <div className="panel" style={{ padding: '1rem', background: 'hsl(var(--background))', marginBottom: '1.25rem' }}>
    <pre style={{
      margin: 0,
      whiteSpace: 'pre-wrap',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.8rem',
      lineHeight: 1.8,
      color: 'hsl(var(--text-main))',
    }}>
      {children}
    </pre>
  </div>
);

const SimpleTable: React.FC<{ rows: Array<[string, string]> }> = ({ rows }) => (
  <table className="table" style={{ marginBottom: '1.5rem' }}>
    <tbody>
      {rows.map(([term, description]) => (
        <tr key={term}>
          <td style={{ width: 190, fontWeight: 700, fontSize: '0.875rem' }}>{term}</td>
          <td style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', lineHeight: 1.65 }}>{description}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const SECTIONS: SectionDef[] = [
  {
    id: 'contestants',
    title: 'Contestants',
    icon: <Upload size={14} />,
    content: (
      <div>
        <p className="page-subtitle" style={{ maxWidth: '100%', marginBottom: '1.25rem' }}>
          This section defines the minimum information required to participate in a contest, submit solutions,
          interpret judging results, and communicate with organizers.
        </p>

        <h3 className="section-heading">Participation</h3>
        <SimpleTable rows={[
          ['Registration', 'Open a contest page and register as an individual participant or as a team, depending on the contest policy. Some contests require organizer approval before submissions are accepted.'],
          ['Participation mode', 'Official submissions are used for contest standings. Virtual and practice submissions may be enabled by the organizer and are treated according to the contest rules.'],
          ['Phase access', 'A contest is divided into fixed phases: Public Test, Final Public, Private Test, and Final Private. The available actions depend on the active phase and your registration status.'],
        ]} />

        <h3 className="section-heading">Phase Rules</h3>
        <SimpleTable rows={[
          ['Public Test', 'Participants submit prediction outputs against a public evaluation set. Organizers may allow multiple attempts during this phase.'],
          ['Final Public', 'Participants submit a reproducible package containing source code, inference entrypoint, and model artifacts. This package is used to verify the public result.'],
          ['Private Test', 'Participants submit prediction outputs against a hidden evaluation set. This phase is used to estimate performance on unseen data.'],
          ['Final Private', 'Participants submit the final reproducible package for the hidden evaluation set. Contest rules may require this model to match the Final Public model.'],
        ]} />

        <h3 className="section-heading">Submission Types</h3>
        <SimpleTable rows={[
          ['Output-only phase', 'Submit a prediction file or archive in the format specified by the problem statement. Common formats include CSV, JSONL, or ZIP archives.'],
          ['Final inference phase', 'Submit a ZIP archive containing an executable inference entrypoint, usually infer.py, plus any model files required at runtime.'],
          ['Submission history', 'The submission history page displays raw scores and execution errors. Scaled scores are only applied in standings when enabled by the contest.'],
        ]} />

        <h3 className="section-heading">Integrity Requirements</h3>
        <SimpleTable rows={[
          ['No manual editing', 'Contestants must not manually modify evaluation inputs or generated outputs after inference, unless the problem statement explicitly allows post-processing.'],
          ['Reproducibility', 'A final submission must contain all code and model artifacts required to reproduce the submitted predictions.'],
          ['Package consistency', 'If the contest requires model consistency across final phases, the Final Public and Final Private model artifacts must be identical.'],
          ['Environment limits', 'Contestants must follow the library, network, storage, and runtime restrictions specified by the organizer for the contest.'],
        ]} />

        <h3 className="section-heading">Final Inference Contract</h3>
        <CodeBlock>{`submission.zip
  infer.py
  model files
  optional dependency files

infer.py must read data from:
  --assets-dir

infer.py must write predictions to:
  --output-dir

The expected output filename and format are defined by the problem statement.`}</CodeBlock>

        <h3 className="section-heading">Support</h3>
        <SimpleTable rows={[
          ['Clarifications', 'Use clarifications for questions about problem statements, datasets, scoring rules, or ambiguous contest instructions.'],
          ['Support tickets', 'Use support tickets for account, registration, submission, infrastructure, or worker-related issues.'],
          ['Error messages', 'When a submission fails, include the submission ID, phase, task name, and visible error message when contacting organizers.'],
        ]} />
      </div>
    ),
  },
  {
    id: 'organizers',
    title: 'Organizers',
    icon: <Users size={14} />,
    content: (
      <div>
        <p className="page-subtitle" style={{ maxWidth: '100%', marginBottom: '1.25rem' }}>
          This section summarizes the operational contract required to create tasks that can be judged reliably.
        </p>

        <h3 className="section-heading">Contest Setup</h3>
        <SimpleTable rows={[
          ['Contest metadata', 'Define the title, slug, registration policy, visibility, start time, end time, and participation types before publishing the contest.'],
          ['Tasks', 'Each task must define a title, scoring label, score direction, submission schema, and the expected output format.'],
          ['Phases', 'The system uses four fixed phase definitions: Public Test, Final Public, Private Test, and Final Private. Configure open and close times, judge key, evaluation set, and leaderboard mode for each phase.'],
          ['Leaderboard mode', 'Use best when the best valid submission should count. Use latest only when the latest valid submission should replace previous attempts.'],
        ]} />

        <h3 className="section-heading">Problem Statement Requirements</h3>
        <SimpleTable rows={[
          ['Task definition', 'State the input, expected output, target metric, score direction, and any task-specific constraints before submissions open.'],
          ['Dataset description', 'Specify the training set, public test set, private test set, file naming convention, encoding, and required row ordering.'],
          ['Submission limits', 'State the maximum number of submissions for each phase. Final phases should normally use a strict low limit.'],
          ['Final package policy', 'State whether Final Public and Final Private packages must use the same model architecture, checkpoint, and inference code.'],
          ['Allowed resources', 'List allowed preinstalled libraries, external model usage, network policy, and whether additional package installation is prohibited.'],
        ]} />

        <h3 className="section-heading">Scoring Policy</h3>
        <SimpleTable rows={[
          ['Raw score', 'The raw score is the direct result produced by judge.py according to the task metric. It is shown in submission history.'],
          ['Standing score', 'The standing score is the score used in leaderboards. It may equal the raw score or be normalized by contest policy.'],
          ['Normalization', 'When scale_scores is enabled, each task-phase board normalizes scores against the current best score in that phase. A change in the maximum score updates the standing scores of all entries in that board.'],
          ['Global ranking', 'Global ranking aggregates standing scores by phase category and uses the best score per user and task across all eligible entries and modes.'],
        ]} />

        <h3 className="section-heading">Evaluation Assets</h3>
        <SimpleTable rows={[
          ['Asset keys', 'Use stable asset keys such as inputs, ground_truth, and judge.py. Contestants should not depend on uploaded filenames except where explicitly documented.'],
          ['Single-file assets', 'If an asset is uploaded as a single file under a key such as inputs, workers expose it under assets/inputs/filename.ext.'],
          ['Archive assets', 'If an asset is uploaded as a ZIP archive under a key such as inputs, workers extract it into assets/inputs/.'],
          ['Judge file', 'judge.py remains an executable file at assets/judge.py and is not converted into a directory.'],
        ]} />

        <h3 className="section-heading">Required judge.py Behavior</h3>
        <CodeBlock>{`judge.py must:
  read contestant outputs from --submission-dir or --output-dir
  read evaluation assets from --assets-dir
  print a JSON result to stdout

Required JSON fields:
  status: "success" or "error"
  raw_score: numeric value
  display_score: numeric value used by standings

Optional JSON fields:
  message
  payload`}</CodeBlock>

        <h3 className="section-heading">Publication Checklist</h3>
        <SimpleTable rows={[
          ['Statement', 'Verify that all input, output, scoring, and packaging rules are stated explicitly.'],
          ['Sample validation', 'Run at least one known valid submission and one invalid submission before opening the phase.'],
          ['Dataset availability', 'Confirm that every phase references the correct evaluation set and that all required assets are uploaded.'],
          ['Reproducibility check', 'Verify that a final package can generate the expected prediction file from the provided assets without manual intervention.'],
          ['Announcement policy', 'Use announcements only for official contest changes, maintenance notices, deadlines, and rule clarifications.'],
        ]} />
      </div>
    ),
  },
  {
    id: 'volunteers',
    title: 'Volunteer Workers',
    icon: <Server size={14} />,
    content: (
      <div>
        <p className="page-subtitle" style={{ maxWidth: '100%', marginBottom: '1.25rem' }}>
          Volunteer workers provide compute capacity for judging. A worker should only be enabled on machines where the operator accepts the execution model and resource usage.
        </p>

        <h3 className="section-heading">Requirements</h3>
        <SimpleTable rows={[
          ['Python', 'Python 3.11 or newer is recommended.'],
          ['Disk space', 'Keep sufficient temporary space for submissions, extracted datasets, and model artifacts.'],
          ['Docker', 'Required for sandboxed final inference jobs. Trusted native final execution may be enabled only on controlled machines.'],
          ['Network', 'The worker must be able to reach the platform API and artifact storage endpoints.'],
        ]} />

        <h3 className="section-heading">Setup</h3>
        <CodeBlock>{`pip install --upgrade olpai-volunteer-agent
olpai-volunteer setup
olpai-volunteer approve-token <TOKEN>
olpai-volunteer start`}</CodeBlock>

        <h3 className="section-heading">Operational Notes</h3>
        <SimpleTable rows={[
          ['Worker approval', 'A worker is not eligible for jobs until an administrator approves it and the approval token is configured locally.'],
          ['Output slots', 'Output-only slots control how many non-final jobs the worker can run concurrently.'],
          ['Inference slots', 'Inference slots control how many final inference jobs the worker can run concurrently. Use conservative values for GPU machines.'],
          ['Exclusive inference', 'When enabled, inference jobs do not run concurrently with output-only jobs on the same worker.'],
          ['Failure handling', 'If a worker disconnects or fails to submit results, the server reclaims stale jobs and makes them eligible for another worker.'],
        ]} />

        <h3 className="section-heading">Diagnostics</h3>
        <CodeBlock>{`olpai-volunteer doctor
olpai-volunteer status
olpai-volunteer logs -f`}</CodeBlock>
      </div>
    ),
  },
];

export const DocsPage: React.FC = () => {
  const [active, setActive] = useState(SECTIONS[0].id);
  const section = SECTIONS.find(item => item.id === active) ?? SECTIONS[0];

  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={20} />
              Documentation
            </h1>
            <p className="page-subtitle">
              Operational rules for contestants, organizers, and volunteer workers.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: '1.75rem', alignItems: 'start' }}>
        <aside style={{ position: 'sticky', top: '1rem' }}>
          <nav className="panel" style={{ padding: '0.5rem', marginBottom: 0 }}>
            {SECTIONS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(item.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.55rem 0.65rem',
                  border: 'none',
                  borderLeft: active === item.id ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                  borderRadius: 4,
                  background: active === item.id ? 'hsl(var(--primary) / 0.08)' : 'transparent',
                  color: active === item.id ? 'hsl(var(--primary))' : 'hsl(var(--text-muted))',
                  fontWeight: active === item.id ? 700 : 600,
                  fontSize: '0.85rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {item.icon}
                <span style={{ flex: 1 }}>{item.title}</span>
                {active === item.id && <ChevronRight size={13} />}
              </button>
            ))}
          </nav>
        </aside>

        <main className="panel" style={{ padding: '1.25rem 1.35rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '1rem' }}>
            <BookOpen size={18} />
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{section.title}</h2>
          </div>
          {section.content}
        </main>
      </div>
    </div>
  );
};
