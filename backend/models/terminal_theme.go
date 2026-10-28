package models

import (
	"time"
)

type TerminalTheme struct {
	ID              uint      `json:"id" gorm:"primaryKey"`
	UserID          uint      `json:"user_id" gorm:"uniqueIndex;not null"`
	FontFamily      string    `json:"font_family" gorm:"default:'Monaco, monospace'"`
	FontSize        int       `json:"font_size" gorm:"default:14"`
	ForegroundColor string    `json:"foreground_color" gorm:"default:'#ffffff'"`
	BackgroundColor string    `json:"background_color" gorm:"default:'#1e1e1e'"`
	CursorColor     string    `json:"cursor_color" gorm:"default:'#ffffff'"`
	SelectionColor  string    `json:"selection_color" gorm:"default:'#264f78'"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

func (TerminalTheme) TableName() string {
	return "terminal_themes"
}
