package models

import (
	"time"
)

type QuickCommand struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	UserID      uint      `json:"user_id" gorm:"not null;index"`
	Name        string    `json:"name" gorm:"not null"`
	Command     string    `json:"command" gorm:"not null"`
	WorkspaceID *uint     `json:"workspace_id" gorm:"index"`
	UseCount    int       `json:"use_count" gorm:"default:0"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (QuickCommand) TableName() string {
	return "quick_commands"
}
