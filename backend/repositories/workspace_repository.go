package repositories

import (
	"webssh-backend/config"
	"webssh-backend/models"
)

func CreateWorkspace(workspace *models.Workspace) error {
	return config.GetDB().Create(workspace).Error
}

func CreateWorkspaceMember(member *models.WorkspaceMember) error {
	return config.GetDB().Create(member).Error
}

func GetWorkspaceMembersByUserID(userID uint) ([]models.WorkspaceMember, error) {
	var members []models.WorkspaceMember
	err := config.GetDB().Where("user_id = ?", userID).Find(&members).Error
	return members, err
}

type WorkspaceMemberCount struct {
	WorkspaceID uint
	Count       int64
}
