package repositories

import (
	"webssh-backend/config"
	"webssh-backend/models"
)

func GetTerminalSessionsByUserID(userID uint) ([]models.TerminalSession, error) {
	var sessions []models.TerminalSession
	err := config.GetDB().Where("user_id = ?", userID).Order("saved_at desc").Find(&sessions).Error
	return sessions, err
}

func GetTerminalSessionByIDAndUserID(id, userID uint) (models.TerminalSession, error) {
	var session models.TerminalSession
	err := config.GetDB().Where("id = ? AND user_id = ?", id, userID).First(&session).Error
	return session, err
}

func CreateTerminalSession(session *models.TerminalSession) error {
	return config.GetDB().Create(session).Error
}

func DeleteTerminalSessionByIDAndUserID(id, userID uint) error {
	return config.GetDB().Where("id = ? AND user_id = ?", id, userID).Delete(&models.TerminalSession{}).Error
}
