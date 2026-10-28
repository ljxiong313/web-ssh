package models

import (
	"time"
)

type AuditLog struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	UserID      uint      `json:"user_id" gorm:"index"`
	Action      string    `json:"action" gorm:"not null"` // login, logout, password_change, mfa_enable, etc.
	Resource    string    `json:"resource"`               // connection, user, workspace, etc.
	ResourceID  uint      `json:"resource_id"`
	WorkspaceID *uint     `json:"workspace_id" gorm:"index"`
	Details     string    `json:"details" gorm:"type:text"`
	IPAddress   string    `json:"ip_address"`
	UserAgent   string    `json:"user_agent"`
	Success     bool      `json:"success" gorm:"default:true"`
	CreatedAt   time.Time `json:"created_at"`
}

func (AuditLog) TableName() string {
	return "audit_logs"
}
