package models

import (
	"time"
)

type CommandHistory struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	UserID       uint      `json:"user_id" gorm:"not null;index"`
	WorkspaceID  *uint     `json:"workspace_id" gorm:"index"`
	ConnectionID uint      `json:"connection_id" gorm:"index"`
	Command      string    `json:"command" gorm:"not null"`
	SessionID    string    `json:"session_id"`
	CreatedAt    time.Time `json:"created_at"`
}

func (CommandHistory) TableName() string {
	return "command_history"
}
