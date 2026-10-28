package models

import (
	"time"
)

type Workspace struct {
	ID              uint      `json:"id" gorm:"primaryKey"`
	Name            string    `json:"name" gorm:"not null"`
	OwnerID         uint      `json:"owner_id" gorm:"not null"`
	Plan            string    `json:"plan" gorm:"default:free"` // free/pro/team/enterprise
	MaxMembers      int       `json:"max_members" gorm:"default:5"`
	MemberCount     int       `json:"member_count" gorm:"-"`
	CurrentUserRole string    `json:"current_user_role" gorm:"-"`
	Status          string    `json:"status" gorm:"default:active"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

func (Workspace) TableName() string {
	return "workspaces"
}

type WorkspaceMember struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	WorkspaceID uint      `json:"workspace_id" gorm:"index;not null"`
	UserID      uint      `json:"user_id" gorm:"index;not null"`
	Role        string    `json:"role" gorm:"default:operator"` // admin/operator/viewer
	InvitedBy   uint      `json:"invited_by"`
	JoinedAt    time.Time `json:"joined_at"`
}

func (WorkspaceMember) TableName() string {
	return "workspace_members"
}
