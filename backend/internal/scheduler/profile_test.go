package scheduler

import (
	"testing"

	"github.com/google/uuid"
)

func TestParseWorkerProfilePreservesDeclaredZeroInferenceSlots(t *testing.T) {
	profile, err := ParseWorkerProfile(
		uuid.New(),
		[]byte(`{"max_output_slots":4,"max_inference_slots":0,"exclusive_inference":true}`),
		4,
	)
	if err != nil {
		t.Fatalf("parse profile: %v", err)
	}
	if profile.MaxOutputSlots != 4 {
		t.Fatalf("expected 4 output slots, got %d", profile.MaxOutputSlots)
	}
	if profile.MaxInferenceSlots != 0 {
		t.Fatalf("expected declared zero inference slots, got %d", profile.MaxInferenceSlots)
	}
	if HasJobSlotCapability(profile, true) {
		t.Fatal("worker with zero inference slots must not accept final jobs")
	}
}

func TestParseWorkerProfileKeepsLegacySharedCapacityFallback(t *testing.T) {
	profile, err := ParseWorkerProfile(uuid.New(), []byte(`{}`), 3)
	if err != nil {
		t.Fatalf("parse profile: %v", err)
	}
	if profile.MaxOutputSlots != 3 || profile.MaxInferenceSlots != 3 {
		t.Fatalf(
			"expected legacy shared capacity 3/3, got %d/%d",
			profile.MaxOutputSlots,
			profile.MaxInferenceSlots,
		)
	}
}
