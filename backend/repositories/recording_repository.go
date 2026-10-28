package repositories

import (
	"webssh-backend/config"
	"webssh-backend/models"
)

func CreateRecording(recording *models.TerminalRecording) error {
	return config.GetDB().Create(recording).Error
}

func UpdateRecordingStatus(recordingID uint, status string) error {
	return config.GetDB().Model(&models.TerminalRecording{}).Where("id = ?", recordingID).Update("status", status).Error
}

func GetRecordingByID(recordingID uint) (models.TerminalRecording, error) {
	var recording models.TerminalRecording
	err := config.GetDB().Where("id = ?", recordingID).First(&recording).Error
	return recording, err
}

func UpdateRecording(recording *models.TerminalRecording, updates map[string]interface{}) error {
	return config.GetDB().Model(recording).Updates(updates).Error
}
