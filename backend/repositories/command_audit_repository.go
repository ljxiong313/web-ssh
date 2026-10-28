package repositories

import (

	"webssh-backend/config"
	"webssh-backend/models"
)

type TopCommand struct {
	Command string `json:"command"`
	Count   int64  `json:"count"`
}

type ActionCount struct {
	Action string `json:"action"`
	Count  int64  `json:"count"`
}

func CreateCommandAuditLog(log *models.CommandAuditLog) error {
	return config.GetDB().Create(log).Error
}
