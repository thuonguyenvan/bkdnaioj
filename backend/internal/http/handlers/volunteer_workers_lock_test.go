package handlers

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestAcquireSchedulerLockSerializesClaims(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	handler := &VolunteerWorkerHandler{rdb: rdb}
	releaseFirst, acquired := handler.acquireSchedulerLock(context.Background())
	if !acquired {
		t.Fatal("first scheduler lock was not acquired")
	}

	acquiredSecond := make(chan func(), 1)
	go func() {
		release, ok := handler.acquireSchedulerLock(context.Background())
		if ok {
			acquiredSecond <- release
		}
	}()

	select {
	case release := <-acquiredSecond:
		release()
		t.Fatal("second scheduler lock acquired before the first was released")
	case <-time.After(75 * time.Millisecond):
	}

	releaseFirst()

	select {
	case release := <-acquiredSecond:
		release()
	case <-time.After(time.Second):
		t.Fatal("second scheduler lock did not acquire after release")
	}
}

func TestAcquireSchedulerLockWithoutRedis(t *testing.T) {
	handler := &VolunteerWorkerHandler{}
	release, acquired := handler.acquireSchedulerLock(context.Background())
	if !acquired {
		t.Fatal("scheduler lock should fail open when Redis is unavailable")
	}
	release()
}
