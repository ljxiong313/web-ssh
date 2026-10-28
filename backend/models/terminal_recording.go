package models

import (
	"time"
)

// TerminalRecording 终端录像记录（Team 版功能）
type TerminalRecording struct {
	ID           uint   `json:"id" gorm:"primaryKey"`
	UserID       uint   `json:"user_id" gorm:"not null;index"`
	ConnectionID uint   `json:"connection_id" gorm:"not null;index"`
	ConnName     string `json:"conn_name" gorm:"not null"`
	WorkspaceID  uint   `json:"workspace_id" gorm:"index"`
	// 录像元数据
	Duration int    `json:"duration" gorm:"default:0"`       // 录像时长（秒）
	Size     int64  `json:"size" gorm:"default:0"`           // 文件大小（字节）
	FilePath string `json:"file_path" gorm:"not null"`       // 录像文件路径
	Status   string `json:"status" gorm:"default:recording"` // recording/completed/failed
	// 时间戳
	StartedAt time.Time  `json:"started_at"`
	EndedAt   *time.Time `json:"ended_at"`
	CreatedAt time.Time  `json:"created_at"`
}

func (TerminalRecording) TableName() string {
	return "terminal_recordings"
}

// TerminalRecordingEvent 终端录像事件（用于 asciinema 格式）
type TerminalRecordingEvent struct {
	Time float64 `json:"time"` // 相对开始时间（秒）
	Type string  `json:"type"` // "o" = output, "i" = input
	Data string  `json:"data"` // 终端数据
}

// ToAsciinema 转换为 asciinema v2 格式
func (r *TerminalRecording) ToAsciinema(events []TerminalRecordingEvent) map[string]interface{} {
	return map[string]interface{}{
		"version":   2,
		"width":     80,
		"height":    24,
		"timestamp": r.StartedAt.Unix(),
		"env": map[string]string{
			"SHELL": "/bin/bash",
			"TERM":  "xterm-256color",
		},
	}
}
