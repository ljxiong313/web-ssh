package models

import (
	"time"
)

type User struct {
	ID            uint       `json:"id" gorm:"primaryKey"`
	Email         string     `json:"email" gorm:"uniqueIndex;not null"`
	Username      string     `json:"username" gorm:"not null"`
	PasswordHash  string     `json:"-" gorm:"column:password_hash;not null"`
	Status        string     `json:"status" gorm:"default:active"` // active, disabled, locked
	LoginAttempts int        `json:"-" gorm:"default:0"`
	LockedUntil   *time.Time `json:"-"`
	LastLoginAt   *time.Time `json:"last_login_at"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

func (User) TableName() string {
	return "users"
}
