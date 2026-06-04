# Phase 05 — Official-First Policy & Priority Validation

**Nhóm:** B - Bonus  
**Effort:** 1h (giảm từ 2.5h)  
**Priority:** P2

## Thay đổi so với plan cũ

Phase 05 cũ đề xuất "2 Redis stream high/low, worker poll high trước". **Approach này conflict với Phase 03** vì Phase 03 đã chuyển sang server-side scheduling (`/claim-next`). Hai worker-pull streams và server-picks không thể cùng tồn tại.

**Phase 05 mới:** Không implement thêm gì — chỉ là một **sub-experiment trong Phase 03's benchmark** để đo riêng hiệu quả của official-first filter.

---

## Thiết kế Official-First Filter (đã có trong Phase 03)

Document (Section 2) mô tả rõ: official-first là một filter layer trong `claim_job()`, không phải một queue riêng:

```python
def claim_job(worker_id, now):
    jobs = get_queued_jobs()

    # Official-first policy — filter trước khi tính cost
    if official_contest_active(now):
        jobs = [j for j in jobs if j.entry_mode == "official"]

    # Sau đó mới tính cost function như bình thường
    ...
```

Go implementation trong `ClaimNext()` (Phase 03):
```go
// Sau khi lấy candidates:
if isOfficialContestActive(ctx, now) {
    candidates = filterByEntryMode(candidates, "official")
}
// Tiếp tục tính cost...
```

---

## Experiment: đo lợi ích của official-first filter

Thêm vào benchmark của Phase 03 một test case riêng:

**Setup:**
- Mix job: 70% practice, 20% virtual, 10% official
- Official contest đang active
- 3 workers, 50 jobs × 3 rounds

**So sánh:**
| Filter | Official job p50 wait | Practice job p50 wait |
|--------|----------------------|----------------------|
| Không filter (FIFO) | X ms | X ms |
| Official-first filter | X/3 ms ≈ | X+α ms |

**Metric bổ sung trong Prometheus:**
```go
// Thêm vào metrics.go
OfficialJobWaitTime = prometheus.NewHistogram(...)
PracticeJobWaitTime = prometheus.NewHistogram(...)
// Label: entry_mode = "official" | "virtual" | "practice"
```

Đây là số liệu tự nhiên của Phase 03, không cần code mới.

---

## Tại sao không làm 2-stream priority nữa

| Approach | Vấn đề |
|----------|--------|
| 2 Redis stream (high/low) + worker poll | Conflict với `/claim-next` server-side scheduling |
| Nếu giữ pull model | Phải bỏ cost function của Phase 03 |
| Nếu giữ cả hai | Race condition: server picks job A nhưng worker đã pull job B từ stream |

Kết luận: **official-first là filter trong cost function**, không phải queue mechanism riêng. Phase 05 không cần implementation độc lập.

---

## Success Criteria

- [ ] `ClaimNext()` trong Phase 03 có official-first filter hoạt động
- [ ] Benchmark Phase 03 đo riêng `official_job_wait_time` vs `practice_job_wait_time`
- [ ] Kết quả cho thấy official job wait time giảm khi filter active
