package repositories

import (
	"webssh-backend/config"
	"webssh-backend/models"
)

func CreateAuditLog(log *models.AuditLog) error {
	return config.GetDB().Create(log).Error
}
