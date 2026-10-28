package models

import (
	"time"
)

type ConnectionLog struct {
	ID           uint       `json:"id" gorm:"primaryKey"`
	UserID       uint       `json:"user_id" gorm:"not null;index"`
	ConnName     string     `json:"conn_name" gorm:"not null"`
	Host         string     `json:"host" gorm:"not null"`
	Username     string     `json:"username"`
	ConnectedAt  time.Time  `json:"connected_at"`
	DisconnectAt *time.Time `json:"disconnect_at"`
	Duration     int64      `json:"duration" gorm:"default:0"`     // seconds
	Status       string     `json:"status" gorm:"default:success"` // success, failed
	ErrMsg       string     `json:"err_msg" gorm:"type:text"`
	CreatedAt    time.Time  `json:"created_at"`
}

func (ConnectionLog) TableName() string {
	return "connection_logs"
}
