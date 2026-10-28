package repositories

import (
	"webssh-backend/config"
	"webssh-backend/models"

	"gorm.io/gorm"
)

func buildConnectionWorkspaceQuery(db *gorm.DB, userID uint, workspaceID *uint) *gorm.DB {
	if workspaceID != nil {
		if *workspaceID == 0 {
			return db.Where("user_id = ? AND (workspace_id IS NULL OR workspace_id = ?)", userID, *workspaceID)
		}
		return db.Where("user_id = ? AND workspace_id = ?", userID, *workspaceID)
	}
	return db.Where("user_id = ? AND workspace_id IS NULL", userID)
}

// GetConnections 获取用户连接列表（预加载 Folder）
func GetConnections(userID uint, workspaceID *uint) ([]models.Connection, error) {
	var connections []models.Connection
	db := buildConnectionWorkspaceQuery(config.GetDB(), userID, workspaceID)
	err := db.Preload("Folder").Order("sort_order, id").Find(&connections).Error
	return connections, err
}

// GetConnectionByID 根据 ID 和用户 ID 获取单个连接
func GetConnectionByID(id, userID uint) (*models.Connection, error) {
	var connection models.Connection
	err := config.GetDB().Where("id = ? AND user_id = ?", id, userID).First(&connection).Error
	if err != nil {
		return nil, err
	}
	return &connection, nil
}

// GetConnectionByIDWithFolder 根据 ID 和用户 ID 获取单个连接并预加载 Folder
func GetConnectionByIDWithFolder(id, userID uint) (*models.Connection, error) {
	var connection models.Connection
	err := config.GetDB().Where("id = ? AND user_id = ?", id, userID).Preload("Folder").First(&connection).Error
	if err != nil {
		return nil, err
	}
	return &connection, nil
}

// CreateConnection 创建连接
func CreateConnection(connection *models.Connection) error {
	return config.GetDB().Create(connection).Error
}

// SaveConnection 保存连接
func SaveConnection(connection *models.Connection) error {
	return config.GetDB().Save(connection).Error
}

// DeleteConnection 删除连接
func DeleteConnection(id, userID uint) error {
	return config.GetDB().Where("id = ? AND user_id = ?", id, userID).Delete(&models.Connection{}).Error
}

// GetWorkspaceByID 根据 ID 获取工作空间
func GetWorkspaceByID(id uint) (*models.Workspace, error) {
	var workspace models.Workspace
	err := config.GetDB().First(&workspace, id).Error
	if err != nil {
		return nil, err
	}
	return &workspace, nil
}

// UpdateConnectionSortOrder 在事务中更新连接排序
func UpdateConnectionSortOrder(tx *gorm.DB, id, userID uint, sortOrder int) error {
	return tx.Model(&models.Connection{}).Where("id = ? AND user_id = ?", id, userID).Update("sort_order", sortOrder).Error
}

// GetConnectionsForExport 获取用于导出的连接列表
func GetConnectionsForExport(userID uint, workspaceID *uint) ([]models.Connection, error) {
	var connections []models.Connection
	db := buildConnectionWorkspaceQuery(config.GetDB(), userID, workspaceID)
	err := db.Find(&connections).Error
	return connections, err
}
