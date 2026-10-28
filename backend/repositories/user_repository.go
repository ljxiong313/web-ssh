package repositories

import (
	"webssh-backend/config"
	"webssh-backend/models"
)

func GetUserByEmail(email string) (models.User, error) {
	var user models.User
	err := config.GetDB().Where("email = ?", email).First(&user).Error
	return user, err
}

func CreateUser(user *models.User) error {
	return config.GetDB().Create(user).Error
}

func SaveUser(user *models.User) error {
	return config.GetDB().Save(user).Error
}

func CreateAuditLogWithParams(userID uint, action, resource string, resourceID uint, details, ip, userAgent string, success bool) error {
	log := models.AuditLog{
		UserID:     userID,
		Action:     action,
		Resource:   resource,
		ResourceID: resourceID,
		Details:    details,
		IPAddress:  ip,
		UserAgent:  userAgent,
		Success:    success,
	}
	return config.GetDB().Create(&log).Error
}
