package models

import (
	"time"
)

type Folder struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	UserID      uint      `json:"user_id" gorm:"not null;index"`
	Name        string    `json:"name" gorm:"not null"`
	ParentID    *uint     `json:"parent_id" gorm:"index"`
	WorkspaceID *uint     `json:"workspace_id" gorm:"index"`
	SortOrder   int       `json:"sort_order" gorm:"default:0"`
	CreatedAt   time.Time `json:"created_at"`

	Parent   *Folder  `json:"parent,omitempty" gorm:"foreignKey:ParentID"`
	Children []Folder `json:"children,omitempty" gorm:"foreignKey:ParentID"`
}

func (Folder) TableName() string {
	return "folders"
}
