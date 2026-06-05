import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, ChevronDown, ChevronRight, Trophy, Upload, Cpu, Shield,
  Server, BarChart2, HelpCircle, Zap, Users, FileText
} from 'lucide-react';

/* ── Types ──────────────────────────────────────────────── */
interface SectionDef {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
}

interface FaqItem { q: string; a: string }

/* ── FAQ ────────────────────────────────────────────────── */
const FAQ: FaqItem[] = [
  {
    q: 'Tôi cần đăng ký tham gia cuộc thi như thế nào?',
    a: 'Vào trang Contest → chọn cuộc thi → nhấn "Register". Với cuộc thi yêu cầu duyệt thủ công, bạn cần chờ BTC phê duyệt trước khi nộp bài.',
  },
  {
    q: 'Định dạng file nộp bài là gì?',
    a: 'Tuỳ task. Phase output-only (public_test, private_test): nộp file CSV/ZIP chứa dự đoán. Phase final (final_public, final_private): nộp file ZIP chứa mô hình và script infer.py.',
  },
  {
    q: 'Tôi có thể nộp bao nhiêu lần?',
    a: 'Không giới hạn số lần nộp trong thời gian phase mở. Bảng xếp hạng dùng submission tốt nhất hoặc mới nhất tuỳ cấu hình của BTC.',
  },
  {
    q: 'Score được tính thế nào trên Global Ranking?',
    a: 'Global Ranking tổng hợp điểm tốt nhất của mỗi thí sinh trên tất cả tasks và cuộc thi, phân theo loại phase (public_test, final_public…).',
  },
  {
    q: 'Volunteer Worker là gì? Tôi có cần cài không?',
    a: 'Volunteer Worker là agent chạy trên máy tính của bạn để giúp chấm bài. Thí sinh thường KHÔNG cần cài — chỉ người muốn đóng góp tài nguyên tính toán mới cần. Xem mục "Volunteer Judge Worker" để biết thêm.',
  },
  {
    q: 'Bài nộp của tôi bị "Failed" — nguyên nhân thường gặp?',
    a: '1) File sai định dạng (CSV thiếu header, ZIP thiếu infer.py). 2) Hết thời gian chạy (timeout). 3) Script lỗi runtime — xem error log trong chi tiết submission. 4) BTC chưa upload dataset — liên hệ BTC.',
  },
  {
    q: 'Leaderboard được cập nhật ngay sau khi nộp không?',
    a: 'Có — sau khi worker chấm xong (thường vài giây đến vài phút tuỳ tải hệ thống), leaderboard tự cập nhật không cần refresh.',
  },
  {
    q: 'Phase Private Test/Final Private khác gì Public?',
    a: 'Public phases dùng bộ test công khai (thí sinh biết trước). Private phases dùng bộ test ẩn — đây là điểm chính thức quyết định thứ hạng cuối cùng.',
  },
];

/* ── Section content ────────────────────────────────────── */
const SECTIONS: SectionDef[] = [
  /* Overview */
  {
    id: 'overview',
    icon: <BookOpen size={14} />,
    title: 'Tổng quan',
    content: (
      <div>
        <p className="page-subtitle" style={{ marginBottom: '1.5rem', maxWidth: '100%' }}>
          <strong>OLPAI</strong> (Olympic AI – Online Judge) là nền tảng tổ chức và chấm thi các cuộc thi Trí tuệ Nhân tạo.
          Hệ thống hỗ trợ đầy đủ vòng đời: từ thiết kế bài thi, tổ chức nhiều phases, chấm bài tự động,
          quản lý bảng xếp hạng đến phân tích kết quả.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { icon: <Trophy size={16} color="hsl(38,92%,50%)" />, title: 'Multi-phase Contest', desc: 'Hỗ trợ 4 phase: Public Test, Final Public, Private Test, Final Private' },
            { icon: <Upload size={16} color="hsl(222,47%,40%)" />, title: 'Flexible Submission', desc: 'Output-only (CSV/ZIP) hoặc model inference (ZIP + infer.py)' },
            { icon: <Cpu size={16} color="hsl(142,76%,36%)" />, title: 'Distributed Judging', desc: 'Volunteer worker network tự động phân phối tải' },
            { icon: <BarChart2 size={16} color="hsl(199,89%,40%)" />, title: 'Real-time Leaderboard', desc: 'Cập nhật ngay sau chấm, hỗ trợ best/latest mode' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="panel" style={{ padding: '1rem', marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                {icon}
                <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{title}</span>
              </div>
              <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.8rem', margin: 0, lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>

        <h3 className="section-heading" style={{ marginBottom: '0.75rem' }}>Kiến trúc</h3>
        <div className="panel" style={{ padding: '1rem', marginBottom: 0, background: 'hsl(var(--background))' }}>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'hsl(var(--text-muted))', margin: 0, lineHeight: 2, whiteSpace: 'pre-wrap' }}>
{`User Browser  →  React Frontend (Vite + TypeScript)
                ↓ HTTP / REST
Go API Server  →  Echo + JWT Auth + PostgreSQL (Supabase)
                ↓ Redis Streams (jobs:judge)
Judge Workers  →  Internal Worker | Volunteer Agent
                ↓ MinIO S3
Artifact Store →  Submissions, Datasets, Checkpoints`}
          </pre>
        </div>
      </div>
    ),
  },

  /* Contest & Phases */
  {
    id: 'contest',
    icon: <Trophy size={14} />,
    title: 'Contest & Phases',
    content: (
      <div>
        <p className="page-subtitle" style={{ marginBottom: '1.5rem', maxWidth: '100%' }}>
          Mỗi cuộc thi gồm nhiều <strong>Tasks</strong> (bài toán), mỗi task có tối đa 4 <strong>Phases</strong> (vòng chấm).
          Các phase có thể mở đồng thời.
        </p>

        <h3 className="section-heading">4 loại Phase</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {[
            { key: 'public_test',    label: 'Public Test',    note: 'Thường xuyên mở',    desc: 'Bộ test công khai — luyện tập và kiểm tra. Điểm hiển thị ngay.' },
            { key: 'final_public',   label: 'Final Public',   note: 'Phase chính thức',   desc: 'Vòng chính với bộ test công khai. Submission model inference (ZIP + infer.py).' },
            { key: 'private_test',   label: 'Private Test',   note: 'Bộ test ẩn',         desc: 'Thí sinh không thấy test trước. Output-only — nộp CSV dự đoán.' },
            { key: 'final_private',  label: 'Final Private',  note: 'Quyết định kết quả', desc: 'Phase quan trọng nhất — inference trên bộ test hoàn toàn ẩn.' },
          ].map(({ key, label, note, desc }) => (
            <div key={key} className="panel" style={{ padding: '0.875rem 1rem', marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', background: 'hsl(var(--background))', padding: '0.1rem 0.4rem', borderRadius: 4, border: '1px solid hsl(var(--border))' }}>{key}</code>
                <strong style={{ fontSize: '0.875rem' }}>{label}</strong>
                <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>{note}</span>
              </div>
              <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.82rem', margin: 0, lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>

        <h3 className="section-heading">Luồng tham gia</h3>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
          {['Đăng ký contest', 'Chờ duyệt (nếu cần)', 'Tải đề + dataset', 'Nộp submission', 'Xem leaderboard'].map((step, i, arr) => (
            <React.Fragment key={step}>
              <div className="panel" style={{ padding: '0.4rem 0.75rem', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'hsl(var(--primary))', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{step}</span>
              </div>
              {i < arr.length - 1 && <ChevronRight size={14} color="hsl(var(--text-muted))" />}
            </React.Fragment>
          ))}
        </div>
      </div>
    ),
  },

  /* Submission */
  {
    id: 'submission',
    icon: <Upload size={14} />,
    title: 'Nộp bài',
    content: (
      <div>
        <h3 className="section-heading">Output-only Phase (public_test, private_test)</h3>
        <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '0.75rem' }}>
          Nộp file dự đoán trực tiếp. Định dạng do BTC quy định, thường là CSV:
        </p>
        <div className="panel" style={{ padding: '0.875rem 1rem', marginBottom: '1.5rem', background: 'hsl(var(--background))' }}>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'hsl(142,60%,35%)', margin: 0 }}>{`id,y_pred\n1,0\n2,1\n3,0\n...`}</pre>
        </div>

        <h3 className="section-heading">Model Inference Phase (final_public, final_private)</h3>
        <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '0.75rem' }}>
          Nộp file ZIP chứa model và script chạy inference:
        </p>
        <div className="panel" style={{ padding: '0.875rem 1rem', marginBottom: '0.75rem', background: 'hsl(var(--background))' }}>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'hsl(222,47%,40%)', margin: 0 }}>{`submission.zip\n├── infer.py          # Bắt buộc — entrypoint\n├── model.pt          # Checkpoint\n├── requirements.txt  # Tuỳ chọn\n└── ...`}</pre>
        </div>
        <div className="panel" style={{ padding: '0.875rem 1rem', marginBottom: '1.5rem', borderLeft: '3px solid hsl(var(--warning))' }}>
          <p style={{ color: 'hsl(var(--warning))', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.25rem' }}>⚠️ infer.py phải nhận đúng arguments</p>
          <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.82rem', margin: 0, lineHeight: 1.7 }}>
            <code style={{ fontFamily: 'var(--font-mono)' }}>--submission-dir</code>,&nbsp;
            <code style={{ fontFamily: 'var(--font-mono)' }}>--assets-dir</code>,&nbsp;
            <code style={{ fontFamily: 'var(--font-mono)' }}>--output-dir</code>,&nbsp;
            <code style={{ fontFamily: 'var(--font-mono)' }}>--context</code> và ghi output ra <code style={{ fontFamily: 'var(--font-mono)' }}>output-dir</code>. Xem template từ BTC.
          </p>
        </div>

        <h3 className="section-heading">Trạng thái submission</h3>
        <table className="table" style={{ marginBottom: 0 }}>
          <tbody>
            {[
              { status: 'queued',  cls: '',        desc: 'Đang trong hàng chờ, chưa có worker nhận' },
              { status: 'running', cls: 'running', desc: 'Worker đang chấm bài' },
              { status: 'done',    cls: 'success', desc: 'Chấm xong, có điểm' },
              { status: 'failed',  cls: 'danger',  desc: 'Lỗi — xem error message để biết nguyên nhân' },
            ].map(({ status, cls, desc }) => (
              <tr key={status}>
                <td style={{ width: 90 }}><span className={`badge${cls ? ` badge-${cls}` : ''}`}>{status}</span></td>
                <td style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },

  /* Leaderboard */
  {
    id: 'leaderboard',
    icon: <BarChart2 size={14} />,
    title: 'Leaderboard & Scoring',
    content: (
      <div>
        <h3 className="section-heading">Task Phase Leaderboard</h3>
        <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '1.25rem' }}>
          Mỗi phase của mỗi task có bảng xếp hạng riêng. Score có thể được <strong>normalize</strong> (về 0–100)
          nếu BTC bật tuỳ chọn <code style={{ fontFamily: 'var(--font-mono)' }}>scale_scores</code>.
        </p>

        <h3 className="section-heading">Chọn submission cho leaderboard</h3>
        <table className="table" style={{ marginBottom: '1.5rem' }}>
          <tbody>
            {[
              { mode: 'best',   desc: 'Submission có điểm cao nhất — mặc định' },
              { mode: 'latest', desc: 'Submission mới nhất — BTC chọn khi muốn đánh giá chiến thuật cuối' },
            ].map(({ mode, desc }) => (
              <tr key={mode}>
                <td style={{ width: 80 }}><code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{mode}</code></td>
                <td style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="section-heading">Global Ranking</h3>
        <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '1.25rem' }}>
          Trang <Link to="/rankings">Rankings</Link> tổng hợp cross-contest — mỗi thí sinh được tính <strong>điểm tốt nhất</strong> trên
          mỗi task, cộng dồn và phân theo loại phase.
        </p>

        <h3 className="section-heading">Incremental Update (O(log n))</h3>
        <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', lineHeight: 1.7 }}>
          Khi submission mới không phá vỡ điểm tối đa hiện tại, hệ thống chỉ cập nhật 1 dòng + Redis ZSET
          thay vì recompute toàn bảng — giảm latency từ ~400ms xuống ~10ms ở quy mô nhỏ.
          Khi có điểm mới cao nhất, full recompute (O(n)) được trigger để đảm bảo tính chính xác.
        </p>
      </div>
    ),
  },

  /* Volunteer Worker */
  {
    id: 'worker',
    icon: <Server size={14} />,
    title: 'Volunteer Judge Worker',
    content: (
      <div>
        <div className="panel" style={{ borderLeft: '3px solid hsl(var(--running))', marginBottom: '1.5rem' }}>
          <p style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.3rem' }}>Volunteer Worker là gì?</p>
          <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', margin: 0, lineHeight: 1.7 }}>
            Thay vì chỉ dùng server trung tâm, OLPAI cho phép bất kỳ máy tính nào tham gia mạng lưới chấm bài.
            Worker nhận job từ hàng chờ Redis, chạy script chấm trong sandbox Docker, trả kết quả về — hoàn toàn tự động.
          </p>
        </div>

        <h3 className="section-heading">Yêu cầu tối thiểu</h3>
        <table className="table" style={{ marginBottom: '1.5rem' }}>
          <tbody>
            {[
              ['Python', '3.11+'],
              ['RAM', '4 GB tối thiểu'],
              ['Disk', '10 GB free'],
              ['Docker', 'Tuỳ chọn — cần cho final phase inference'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ width: 100, fontWeight: 600, fontSize: '0.875rem' }}>{k}</td>
                <td style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="section-heading">Cài đặt & Khởi động</h3>
        <div className="panel" style={{ padding: '1rem', marginBottom: '1.5rem', background: 'hsl(var(--background))' }}>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'hsl(var(--text-main))', margin: 0, lineHeight: 2 }}>{
`# 1. Cài đặt
pip install olpai-volunteer-agent

# 2. Wizard đăng ký (chạy 1 lần)
olpai-volunteer setup
# → Nhập Platform URL + tên máy
# → Hệ thống tự benchmark và đăng ký → ghi lại Worker ID

# 3. Admin approve /admin/workers → copy token

# 4. Lưu token
olpai-volunteer approve-token <TOKEN>

# 5. Chạy worker
olpai-volunteer start                # Foreground
olpai-volunteer service install      # Background service`
          }</pre>
        </div>

        <h3 className="section-heading">Tất cả commands</h3>
        <table className="table" style={{ marginBottom: '1.5rem' }}>
          <tbody>
            {[
              ['olpai-volunteer setup',               'Wizard đăng ký lần đầu'],
              ['olpai-volunteer approve-token <T>',   'Lưu token sau khi admin duyệt'],
              ['olpai-volunteer start',               'Chạy worker (foreground)'],
              ['olpai-volunteer start --workers 4',   'Chạy 4 workers song song'],
              ['olpai-volunteer doctor',              'Kiểm tra môi trường'],
              ['olpai-volunteer benchmark',           'Đo hiệu suất CPU/disk'],
              ['olpai-volunteer status',              'Xem config và trạng thái'],
              ['olpai-volunteer logs -f',             'Theo dõi logs realtime'],
              ['olpai-volunteer service install',     'Cài service tự khởi động khi boot'],
              ['olpai-volunteer cache --clear',       'Xoá cache artifact cũ'],
            ].map(([cmd, desc]) => (
              <tr key={cmd}>
                <td><code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{cmd}</code></td>
                <td style={{ color: 'hsl(var(--text-muted))', fontSize: '0.82rem' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="section-heading">Capability-Aware Scheduling</h3>
        <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '0.75rem' }}>
          Khi đăng ký, worker đo <strong>capability profile</strong>: CPU ops/sec, RAM, disk throughput, Docker startup time.
          Server dùng thông tin này để gán job phù hợp — job inference nặng vào máy mạnh, job output-only vào bất kỳ máy nào.
          Worker chưa benchmark hoặc không có sandbox sẽ không nhận được job.
        </p>
        <div className="panel" style={{ padding: '1rem', background: 'hsl(var(--background))', marginBottom: 0 }}>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'hsl(var(--text-muted))', margin: 0, lineHeight: 1.8 }}>{
`# Runtime estimate T(i,j):
T = T_download + T_unpack + T_setup + T_run

# Cost function (lexicographic order):
cost(worker, job) = (timeout_violation, finish_delay, stress)

# Kiểm tra sandbox:
olpai-volunteer doctor`
          }</pre>
        </div>
      </div>
    ),
  },

  /* Sandbox */
  {
    id: 'sandbox',
    icon: <Shield size={14} />,
    title: 'Sandbox & Bảo mật',
    content: (
      <div>
        <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '1.25rem' }}>
          Code của thí sinh chạy trong môi trường Docker cô lập để bảo vệ worker khỏi code độc hại.
        </p>

        <h3 className="section-heading">Giới hạn sandbox (Final phases)</h3>
        <table className="table" style={{ marginBottom: '1.5rem' }}>
          <tbody>
            {[
              ['Memory',        '512 MB'],
              ['CPU',           '1 core'],
              ['Process limit', '64 PIDs (ngăn fork bomb)'],
              ['Network',       'Tắt hoàn toàn (network_mode=none)'],
              ['Timeout',       'Tuỳ cấu hình BTC (mặc định 20 phút)'],
              ['Filesystem',    'Chỉ shared-temp volume'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ width: 130, fontWeight: 600, fontSize: '0.875rem' }}>{k}</td>
                <td style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="section-heading">Threats được chặn</h3>
        <table className="table" style={{ marginBottom: 0 }}>
          <tbody>
            {[
              ['Fork bomb',          'pids_limit=64 — container bị kill ngay khi vượt ngưỡng'],
              ['Memory bomb',        'mem_limit=512m — OOM killer tự động'],
              ['Infinite loop',      'Timeout + container.kill() sau N giây'],
              ['Network exfiltration','network_mode=none — không có kết nối ra ngoài'],
            ].map(([threat, protection]) => (
              <tr key={threat}>
                <td style={{ width: 160 }}><span className="badge badge-danger">{threat}</span></td>
                <td style={{ color: 'hsl(var(--text-muted))', fontSize: '0.82rem' }}>{protection}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },

  /* Admin / BTC */
  {
    id: 'admin',
    icon: <Users size={14} />,
    title: 'Dành cho BTC / Admin',
    content: (
      <div>
        <h3 className="section-heading">Quy trình tổ chức cuộc thi</h3>
        <ol style={{ paddingLeft: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {[
            ['Tạo Contest',       'Admin → Create Contest. Cấu hình tên, thời gian, chính sách đăng ký.'],
            ['Tạo Task',          'Mỗi contest có thể nhiều tasks. Cấu hình score label, higher_is_better.'],
            ['Upload judge.py',   'Script chấm nhận --submission-dir, --assets-dir, --output-dir, --context và in JSON kết quả.'],
            ['Upload Evaluation Set', 'Upload ground_truth và inputs cho từng bộ test (public/private).'],
            ['Tạo Phases',        'Gán evaluation set cho từng phase. Cấu hình thời gian mở/đóng, leaderboard mode.'],
            ['Publish',           'Contest chuyển sang active — thí sinh có thể đăng ký và nộp bài.'],
          ].map(([title, desc]) => (
            <li key={title} style={{ fontSize: '0.875rem', lineHeight: 1.7 }}>
              <strong>{title}</strong>
              <span style={{ color: 'hsl(var(--text-muted))', display: 'block', marginTop: '0.1rem' }}>{desc}</span>
            </li>
          ))}
        </ol>

        <h3 className="section-heading">Template judge.py</h3>
        <div className="panel" style={{ padding: '1rem', background: 'hsl(var(--background))', marginBottom: 0 }}>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'hsl(var(--text-main))', margin: 0, lineHeight: 1.8 }}>{
`import argparse, json, os

ap = argparse.ArgumentParser()
ap.add_argument("--submission-dir", required=True)
ap.add_argument("--assets-dir",     required=True)
ap.add_argument("--output-dir",     required=True)
ap.add_argument("--context",        required=True)
args = ap.parse_args()

# ... logic chấm bài ...

print(json.dumps({
    "status":        "success",   # hoặc "error"
    "raw_score":     0.95,
    "display_score": 95.0,
    "message":       "ok",
    "payload":       {}
}))`
          }</pre>
        </div>
      </div>
    ),
  },

  /* Metrics */
  {
    id: 'metrics',
    icon: <Zap size={14} />,
    title: 'Monitoring & Metrics',
    content: (
      <div>
        <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '1.25rem' }}>
          Hệ thống expose Prometheus metrics tại <code style={{ fontFamily: 'var(--font-mono)' }}>GET /metrics</code>.
        </p>
        <table className="table" style={{ marginBottom: 0 }}>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Mô tả</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['olpai_leaderboard_recompute_duration_seconds', 'Thời gian recompute (full vs incremental)'],
              ['olpai_queue_depth',                            'Số jobs đang chờ trong Redis stream'],
              ['olpai_job_claim_duration_seconds',             'Thời gian từ enqueue → worker nhận (wait time)'],
              ['olpai_worker_active_claims',                   'Số jobs đang chạy trên từng worker'],
              ['olpai_submissions_total',                      'Tổng submissions theo status'],
              ['olpai_scheduler_decision_duration_seconds',    'Thời gian cost function chọn job'],
              ['olpai_scheduler_constraint_reject_total',      'Jobs bị reject do không đủ tài nguyên'],
              ['olpai_job_timeout_total',                      'Jobs bị timeout và re-enqueue'],
            ].map(([metric, desc]) => (
              <tr key={metric}>
                <td><code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{metric}</code></td>
                <td style={{ color: 'hsl(var(--text-muted))', fontSize: '0.82rem' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },
];

/* ── FAQ Accordion ──────────────────────────────────────── */
const FaqAccordion: React.FC<{ items: FaqItem[] }> = ({ items }) => {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {items.map((item, i) => (
        <div key={i} className="panel" style={{ padding: 0, marginBottom: 0, overflow: 'hidden' }}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.875rem 1rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.q}</span>
            {open === i
              ? <ChevronDown size={15} color="hsl(var(--text-muted))" style={{ flexShrink: 0 }} />
              : <ChevronRight size={15} color="hsl(var(--text-muted))" style={{ flexShrink: 0 }} />
            }
          </button>
          {open === i && (
            <div style={{ padding: '0.875rem 1rem', borderTop: '1px solid hsl(var(--border))' }}>
              <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', lineHeight: 1.8, margin: 0 }}>{item.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

/* ── Page ───────────────────────────────────────────────── */
export const DocsPage: React.FC = () => {
  const [active, setActive] = useState('overview');
  const section = SECTIONS.find(s => s.id === active) ?? SECTIONS[0];

  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={20} />
              Tài liệu hệ thống
            </h1>
            <p className="page-subtitle">Hướng dẫn sử dụng OLPAI — từ thí sinh, BTC đến Volunteer Judge Worker</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.75rem', alignItems: 'flex-start' }}>
        {/* Sidebar */}
        <aside style={{ width: 210, flexShrink: 0, position: 'sticky', top: '1rem' }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.45rem 0.75rem', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer',
                  background: active === s.id ? 'hsl(var(--primary) / 0.08)' : 'transparent',
                  color: active === s.id ? 'hsl(var(--primary))' : 'hsl(var(--text-muted))',
                  fontWeight: active === s.id ? 700 : 500,
                  fontSize: '0.83rem', textAlign: 'left', width: '100%',
                  borderLeft: active === s.id ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                  transition: 'all 0.12s',
                }}
              >
                {s.icon}
                {s.title}
              </button>
            ))}

            <div style={{ margin: '0.5rem 0', borderTop: '1px solid hsl(var(--border))' }} />

            <button
              onClick={() => setActive('faq')}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.45rem 0.75rem', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer',
                background: active === 'faq' ? 'hsl(var(--primary) / 0.08)' : 'transparent',
                color: active === 'faq' ? 'hsl(var(--primary))' : 'hsl(var(--text-muted))',
                fontWeight: active === 'faq' ? 700 : 500,
                fontSize: '0.83rem', textAlign: 'left', width: '100%',
                borderLeft: active === 'faq' ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                transition: 'all 0.12s',
              }}
            >
              <HelpCircle size={14} />
              FAQ
            </button>
          </nav>
        </aside>

        {/* Content */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {active === 'faq' ? (
            <>
              <h2 className="section-heading" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                <HelpCircle size={16} /> Câu hỏi thường gặp
              </h2>
              <FaqAccordion items={FAQ} />
            </>
          ) : (
            <>
              <h2 className="section-heading" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                {section.icon} {section.title}
              </h2>
              {section.content}
            </>
          )}
        </main>
      </div>
    </div>
  );
};
