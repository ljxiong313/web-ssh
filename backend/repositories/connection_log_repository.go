package repositories

import (
	"webssh-backend/config"
	"webssh-backend/models"
)

// GetConnectionLogs 获取用户连接日志
func GetConnectionLogs(userID uint, limit, offset int, startTime, endTime string) ([]models.ConnectionLog, error) {
	var logs []models.ConnectionLog
	query := config.GetDB().Where("user_id = ?", userID)
	if startTime != "" {
		query = query.Where("created_at >= ?", startTime)
	}
	if endTime != "" {
		query = query.Where("created_at <= ?", endTime)
	}
	err := query.Order("created_at desc").Limit(limit).Offset(offset).Find(&logs).Error
	return logs, err
}

// DeleteConnectionLogsByUserID 删除用户的所有连接日志
func DeleteConnectionLogsByUserID(userID uint) error {
	return config.GetDB().Where("user_id = ?", userID).Delete(&models.ConnectionLog{}).Error
}
