package models

import "time"

// SystemSetting 全局系统设置（单例表，固定ID=1）
type SystemSetting struct {
	ID                       uint      `json:"id" gorm:"primaryKey"`
	PasswordMinLength        int       `json:"password_min_length" gorm:"default:8"`
	PasswordRequireUppercase bool      `json:"password_require_uppercase" gorm:"default:true"`
	PasswordRequireLowercase bool      `json:"password_require_lowercase" gorm:"default:true"`
	PasswordRequireNumber    bool      `json:"password_require_number" gorm:"default:true"`
	PasswordRequireSpecial   bool      `json:"password_require_special" gorm:"default:true"`
	SessionTimeoutMinutes    int       `json:"session_timeout_minutes" gorm:"default:120"`
	LoginMaxAttempts         int       `json:"login_max_attempts" gorm:"default:5"`
	LoginLockoutMinutes      int       `json:"login_lockout_minutes" gorm:"default:30"`
	PasswordExpiryDays       int       `json:"password_expiry_days" gorm:"default:0"`
	AllowRegistration        bool      `json:"allow_registration" gorm:"default:true"`
	CreatedAt                time.Time `json:"created_at"`
	UpdatedAt                time.Time `json:"updated_at"`
}

func (SystemSetting) TableName() string {
	return "system_settings"
}
