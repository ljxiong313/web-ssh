package models

import (
	"time"
)

type TerminalSession struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	UserID       uint      `json:"user_id" gorm:"not null;index"`
	ConnectionID uint      `json:"connection_id" gorm:"not null;index"`
	ConnName     string    `json:"conn_name" gorm:"not null"`
	Content      string    `json:"content" gorm:"type:text"`
	SavedAt      time.Time `json:"saved_at"`
	CreatedAt    time.Time `json:"created_at"`
}

func (TerminalSession) TableName() string {
	return "terminal_sessions"
}
