package repositories

import (
	"webssh-backend/config"
	"webssh-backend/models"
)

func GetConnectionByIDAndUserID(connID uint, userID uint) (models.Connection, error) {
	var connection models.Connection
	err := config.GetDB().Where("id = ? AND user_id = ?", connID, userID).First(&connection).Error
	return connection, err
}

func UpdateConnectionPassword(connectionID uint, encryptedPassword string) error {
	return config.GetDB().Model(&models.Connection{}).Where("id = ?", connectionID).Update("password", encryptedPassword).Error
}

func GetUserByID(userID uint) (models.User, error) {
	var user models.User
	err := config.GetDB().Where("id = ?", userID).First(&user).Error
	return user, err
}

func CreateConnectionLog(log *models.ConnectionLog) error {
	return config.GetDB().Create(log).Error
}

func UpdateConnectionLog(log *models.ConnectionLog, updates map[string]interface{}) error {
	return config.GetDB().Model(log).Updates(updates).Error
}

func GetSensitiveCommandRulesByWorkspace(workspaceID uint) ([]models.SensitiveCommandRule, error) {
	var rules []models.SensitiveCommandRule
	err := config.GetDB().Where("workspace_id = ? AND enabled = ?", workspaceID, true).Find(&rules).Error
	return rules, err
}
