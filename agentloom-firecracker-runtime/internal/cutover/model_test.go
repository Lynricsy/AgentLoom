package cutover

import "testing"

func TestMigrationStateMachine(t *testing.T) {
	t.Parallel()

	allowed := [][2]MigrationStatus{
		{StatusPending, StatusArchiving},
		{StatusArchiving, StatusArchived},
		{StatusArchived, StatusRestoring},
		{StatusRestoring, StatusVerified},
		{StatusVerified, StatusFinalized},
		{StatusVerified, StatusRolledBack},
	}
	for _, transition := range allowed {
		if !CanTransition(transition[0], transition[1]) {
			t.Fatalf("expected transition %s -> %s to be allowed", transition[0], transition[1])
		}
	}
	if CanTransition(StatusPending, StatusVerified) {
		t.Fatal("pending migration must not skip archive and restore verification")
	}
	if CanTransition(StatusFinalized, StatusRolledBack) {
		t.Fatal("finalized migration must be terminal")
	}
}
