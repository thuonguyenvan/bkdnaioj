# Phase 04 — Admin UI (Frontend)

**Status:** Pending | **Effort:** 4h | **Depends on:** Phase 02

## Overview

Thêm trang quản lý volunteer workers vào admin area. Admin có thể xem danh sách workers, approve/reject, theo dõi trạng thái real-time (online/offline, job đang chạy, stats).

## Page

**Route:** `/admin/workers` (hoặc tab trong admin setup)
**File:** `frontend/src/pages/admin-workers-page.tsx` (trang mới)
**hoặc:** Tab trong `admin-setup-page.tsx` nếu muốn tập trung

Khuyến nghị: **trang riêng** để dễ quản lý và navigate.

## API Client Methods

**Modify:** `frontend/src/lib/api-client.ts`

```typescript
// Volunteer Worker types
export interface VolunteerWorker {
  id: string;
  display_name: string;
  status: 'pending' | 'active' | 'rejected' | 'inactive';
  capabilities: {
    os?: string;
    cpu_model?: string;
    cpu_cores?: number;
    ram_gb?: number;
    gpu?: Array<{ model: string; vram_gb: number }>;
    docker_available?: boolean;
    disk_free_gb?: number;
  };
  online: boolean;
  last_seen_at?: string;
  current_job_id?: string;
  jobs_completed: number;
  jobs_failed: number;
  approved_at?: string;
  created_at: string;
}

// API methods to add
async listWorkers(): Promise<VolunteerWorker[]>
async approveWorker(id: string): Promise<{ worker: VolunteerWorker; token: string }>
async rejectWorker(id: string): Promise<VolunteerWorker>
async deleteWorker(id: string): Promise<void>
```

## UI Components

### Worker List Table

Columns:
| Column | Content |
|--------|---------|
| Status | badge (pending/active/rejected) + dot indicator online/offline |
| Name | display_name |
| Hardware | CPU cores, RAM, GPU nếu có |
| Activity | jobs_completed / jobs_failed, current job badge nếu đang chạy |
| Last seen | relative time ("2 min ago") |
| Actions | Approve / Reject / Delete buttons |

### Approve Flow

Khi admin click **Approve**:
1. Gọi `POST /api/v1/admin/workers/:id/approve`
2. Response trả về `{ worker, token }`
3. Hiển thị modal với token (copy-to-clipboard)
4. Warning: "Token này chỉ hiển thị 1 lần. Gửi ngay cho volunteer."

```tsx
// Token display modal
<Dialog>
  <p>Worker đã được kích hoạt. Copy token bên dưới và gửi cho volunteer:</p>
  <div className="flex gap-2">
    <code className="flex-1 bg-muted p-2 rounded text-sm break-all">{token}</code>
    <Button onClick={() => navigator.clipboard.writeText(token)}>Copy</Button>
  </div>
  <p className="text-destructive text-sm mt-2">
    ⚠ Token này sẽ không được hiển thị lại.
  </p>
</Dialog>
```

### Capability Display

Mini capability badge cho mỗi worker:
```tsx
function CapabilityBadge({ caps }: { caps: VolunteerWorker['capabilities'] }) {
  return (
    <div className="flex gap-1 flex-wrap text-xs">
      {caps.cpu_cores && <Badge variant="outline">{caps.cpu_cores}C CPU</Badge>}
      {caps.ram_gb && <Badge variant="outline">{caps.ram_gb}GB RAM</Badge>}
      {caps.gpu?.map(g => <Badge key={g.model} variant="secondary">{g.model}</Badge>)}
      {caps.docker_available && <Badge variant="outline">Docker</Badge>}
    </div>
  );
}
```

### Online Indicator

```tsx
function OnlineDot({ online }: { online: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-300'}`} />
  );
}
```

## React Query Setup

```tsx
// List workers (poll every 30s for live status)
const { data: workers = [] } = useQuery({
  queryKey: ['adminWorkers'],
  queryFn: () => api.listWorkers(),
  refetchInterval: 30_000,
});

// Approve mutation
const approveMutation = useMutation({
  mutationFn: (id: string) => api.approveWorker(id),
  onSuccess: ({ token }) => {
    setApprovedToken(token);  // trigger modal
    queryClient.invalidateQueries({ queryKey: ['adminWorkers'] });
  },
});

// Reject mutation
const rejectMutation = useMutation({
  mutationFn: (id: string) => api.rejectWorker(id),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminWorkers'] }),
});
```

## Page Layout

```
Admin Workers                              [Refresh]
─────────────────────────────────────────────────────
Active: 3  |  Pending: 1  |  Offline: 1

┌──────────────────────────────────────────────────────┐
│ ● lab-rtx4090     active   8C/32GB/RTX4090   ✓12/✗0 │
│                            2 min ago   [running job] │
├──────────────────────────────────────────────────────┤
│ ○ giang-vien-A    pending  4C/16GB/no GPU    -       │
│                            pending approval  [Approve][Reject] │
├──────────────────────────────────────────────────────┤
│ ○ clb-ai-server   active   16C/64GB/RTX3060  ✓45/✗2  │
│                            15 min ago (offline)       │
└──────────────────────────────────────────────────────┘
```

## Navigation

Thêm link vào admin sidebar/nav:

**Modify:** `frontend/src/components/` (nav component) hoặc admin layout

## Files to Create/Modify

- **Create:** `frontend/src/pages/admin-workers-page.tsx`
- **Modify:** `frontend/src/lib/api-client.ts` — thêm worker API methods
- **Modify:** Router config — thêm route `/admin/workers`
- **Modify:** Admin nav — thêm link "Workers"

## Todo

- [ ] Thêm API methods vào `api-client.ts`
- [ ] Tạo `admin-workers-page.tsx` với table + mutations
- [ ] Token modal component
- [ ] Thêm route và nav link
- [ ] Test approve flow end-to-end

## Success Criteria

- Admin thấy danh sách workers với status online/offline real-time
- Approve → modal hiện token → copy được
- Reject → worker status update ngay
- Running job hiển thị rõ ràng
