package implementation

import "errors"

// GuardianStatus marks whether a BRIGADE guardian is formally known.
type GuardianStatus string

const (
	GuardianStatusBekend GuardianStatus = "bekend"
)

// ExpertGardianProfile defines the base profile for every BRIGADE guardian.
type ExpertGardianProfile struct {
	ID              string         `json:"id"`
	BrigadeID       string         `json:"brigade_id"`
	Status          GuardianStatus `json:"status"`
	KnownFromStart  bool           `json:"known_from_start"`
	ExpertiseDomain string         `json:"expertise_domain"`
}

// NewExpertGardianProfile creates a guardian that is known from the beginning.
func NewExpertGardianProfile(id, brigadeID, expertiseDomain string) (ExpertGardianProfile, error) {
	if id == "" {
		return ExpertGardianProfile{}, errors.New("id is required")
	}
	if brigadeID == "" {
		return ExpertGardianProfile{}, errors.New("brigade_id is required")
	}

	return ExpertGardianProfile{
		ID:              id,
		BrigadeID:       brigadeID,
		Status:          GuardianStatusBekend,
		KnownFromStart:  true,
		ExpertiseDomain: expertiseDomain,
	}, nil
}
