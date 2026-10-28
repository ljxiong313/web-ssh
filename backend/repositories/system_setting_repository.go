package repositories

import (
	"webssh-backend/config"
	"webssh-backend/models"
)

func GetSystemSetting() (models.SystemSetting, error) {
	var setting models.SystemSetting
	err := config.GetDB().First(&setting, 1).Error
	if err != nil {
		// 未找到则创建默认记录
		setting = models.SystemSetting{}
		if createErr := config.GetDB().Create(&setting).Error; createErr != nil {
			return setting, createErr
		}
		return setting, nil
	}
	return setting, nil
}
