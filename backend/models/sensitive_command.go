package models

import (
	"time"
)

// SensitiveCommandRule 敏感命令规则（Team/Enterprise 版功能）
type SensitiveCommandRule struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	WorkspaceID uint      `json:"workspace_id" gorm:"not null;index"`
	Name        string    `json:"name" gorm:"not null"`              // 规则名称
	Pattern     string    `json:"pattern" gorm:"not null"`           // 匹配模式（正则或关键字）
	MatchType   string    `json:"match_type" gorm:"default:keyword"` // keyword/regex
	Action      string    `json:"action" gorm:"default:block"`       // block/warn/audit
	Description string    `json:"description"`                       // 规则描述
	Enabled     bool      `json:"enabled" gorm:"default:true"`       // 是否启用
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (SensitiveCommandRule) TableName() string {
	return "sensitive_command_rules"
}

// CommandAuditLog 命令审计日志（Team/Enterprise 版功能）
type CommandAuditLog struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	UserID       uint      `json:"user_id" gorm:"not null;index"`
	Username     string    `json:"username"`
	ConnectionID uint      `json:"connection_id" gorm:"index"`
	ConnName     string    `json:"conn_name"`
	WorkspaceID  uint      `json:"workspace_id" gorm:"index"`
	Command      string    `json:"command" gorm:"type:text"`     // 执行的命令
	Action       string    `json:"action" gorm:"default:allow"`  // allow/block/warn
	RuleID       *uint     `json:"rule_id"`                      // 触发的规则ID
	RuleName     string    `json:"rule_name"`                    // 触发的规则名称
	Blocked      bool      `json:"blocked" gorm:"default:false"` // 是否被拦截
	IPAddress    string    `json:"ip_address"`
	SessionID    string    `json:"session_id" gorm:"index"` // 终端会话ID
	CreatedAt    time.Time `json:"created_at"`
}

func (CommandAuditLog) TableName() string {
	return "command_audit_logs"
}
