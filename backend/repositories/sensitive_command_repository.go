package repositories

import (
	"webssh-backend/config"
	"webssh-backend/models"
)

func GetSensitiveCommandRulesByWorkspaceID(workspaceID uint) ([]models.SensitiveCommandRule, error) {
	var rules []models.SensitiveCommandRule
	err := config.GetDB().Where("workspace_id = ?", workspaceID).Order("created_at DESC").Find(&rules).Error
	return rules, err
}

func CreateSensitiveCommandRule(rule *models.SensitiveCommandRule) error {
	return config.GetDB().Create(rule).Error
}

func GetSensitiveCommandRuleByID(id uint) (models.SensitiveCommandRule, error) {
	var rule models.SensitiveCommandRule
	err := config.GetDB().First(&rule, id).Error
	return rule, err
}

func SaveSensitiveCommandRule(rule *models.SensitiveCommandRule) error {
	return config.GetDB().Save(rule).Error
}

func DeleteSensitiveCommandRule(id uint) error {
	return config.GetDB().Delete(&models.SensitiveCommandRule{}, id).Error
}
