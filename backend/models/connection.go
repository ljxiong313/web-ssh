package models

import (
	"time"
)

type Connection struct {
	ID          uint   `json:"id" gorm:"primaryKey"`
	UserID      uint   `json:"user_id" gorm:"not null;index"`
	Name        string `json:"name" gorm:"not null"`
	Host        string `json:"host" gorm:"not null"`
	Port        int    `json:"port" gorm:"default:22"`
	Username    string `json:"username" gorm:"not null"`
	AuthType    string `json:"auth_type" gorm:"default:password"` // password, key
	Password    string `json:"-"`
	PrivateKey  string `json:"-" gorm:"type:text"`
	FolderID    *uint  `json:"folder_id" gorm:"index"`
	WorkspaceID *uint  `json:"workspace_id" gorm:"index"`
	SortOrder   int    `json:"sort_order" gorm:"default:0"`

	SharePassword  string     `json:"-"`
	ShareExpiresAt *time.Time `json:"share_expires_at,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	Folder *Folder `json:"folder,omitempty" gorm:"foreignKey:FolderID"`
}

func (Connection) TableName() string {
	return "connections"
}
