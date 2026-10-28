package repositories

import (
	"webssh-backend/config"
	"webssh-backend/models"
)

// GetCommandHistories 获取用户命令历史（按Workspace过滤）
func GetCommandHistories(userID uint, workspaceID *uint, connectionID uint, limit, offset int) ([]models.CommandHistory, error) {
	var history []models.CommandHistory
	query := config.GetDB().Where("user_id = ?", userID).Order("created_at desc")

	if workspaceID != nil {
		query = query.Where("workspace_id = ?", *workspaceID)
	} else {
		query = query.Where("workspace_id IS NULL")
	}

	if connectionID > 0 {
		query = query.Where("connection_id = ?", connectionID)
	}
	err := query.Limit(limit).Offset(offset).Find(&history).Error
	return history, err
}

// CreateCommandHistory 创建命令历史
func CreateCommandHistory(history *models.CommandHistory) error {
	return config.GetDB().Create(history).Error
}

// DeleteCommandHistoriesByUserID 删除用户的所有命令历史
func DeleteCommandHistoriesByUserID(userID uint, workspaceID *uint) error {
	query := config.GetDB().Where("user_id = ?", userID)

	if workspaceID != nil {
		query = query.Where("workspace_id = ?", *workspaceID)
	} else {
		query = query.Where("workspace_id IS NULL")
	}

	return query.Delete(&models.CommandHistory{}).Error
}

// GetQuickCommands 获取用户快捷命令（按Workspace过滤）
func GetQuickCommands(userID uint, workspaceID *uint) ([]models.QuickCommand, error) {
	var commands []models.QuickCommand
	query := config.GetDB().Where("user_id = ?", userID).Order("use_count desc, id")
	if workspaceID != nil {
		query = query.Where("workspace_id = ?", *workspaceID)
	} else {
		query = query.Where("workspace_id IS NULL")
	}
	err := query.Find(&commands).Error
	return commands, err
}

// CreateQuickCommand 创建快捷命令
func CreateQuickCommand(qc *models.QuickCommand) error {
	return config.GetDB().Create(qc).Error
}

// GetQuickCommandByID 根据ID获取快捷命令
func GetQuickCommandByID(id, userID uint) (*models.QuickCommand, error) {
	var qc models.QuickCommand
	err := config.GetDB().Where("id = ? AND user_id = ?", id, userID).First(&qc).Error
	if err != nil {
		return nil, err
	}
	return &qc, nil
}

// SaveQuickCommand 保存快捷命令
func SaveQuickCommand(qc *models.QuickCommand) error {
	return config.GetDB().Save(qc).Error
}

// DeleteQuickCommand 删除快捷命令
func DeleteQuickCommand(id, userID uint) error {
	return config.GetDB().Where("id = ? AND user_id = ?", id, userID).Delete(&models.QuickCommand{}).Error
}
