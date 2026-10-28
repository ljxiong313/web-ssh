package repositories

import (
	"webssh-backend/config"
	"webssh-backend/models"
)

func GetTerminalThemeByUserID(userID uint) (models.TerminalTheme, error) {
	var theme models.TerminalTheme
	err := config.GetDB().Where("user_id = ?", userID).First(&theme).Error
	return theme, err
}

func CreateTerminalTheme(theme *models.TerminalTheme) error {
	return config.GetDB().Create(theme).Error
}

func SaveTerminalTheme(theme *models.TerminalTheme) error {
	return config.GetDB().Save(theme).Error
}
