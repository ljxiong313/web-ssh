package config

import (
	"log"
	"os"

	"webssh-backend/db"
	"webssh-backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func InitDB() *gorm.DB {
	newLogger := logger.New(
		log.New(os.Stdout, "\r\n", log.LstdFlags),
		logger.Config{
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  true,
		},
	)

	cfg := db.Config{
		Type:    DBType,
		DataDir: DataDir,
	}

	database, err := db.Open(cfg, newLogger)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	DB = database
	AutoMigrate()
	BackfillPersonalWorkspace()
	return database
}

func AutoMigrate() {
	err := DB.AutoMigrate(
		&models.User{},
		&models.RefreshToken{},
		&models.AuditLog{},
		&models.Workspace{},
		&models.WorkspaceMember{},
		&models.Connection{},
		&models.Folder{},
		&models.QuickCommand{},
		&models.CommandHistory{},
		&models.ConnectionLog{},
		&models.TerminalSession{},
		&models.TerminalTheme{},
		&models.TerminalRecording{},
		&models.SensitiveCommandRule{},
		&models.CommandAuditLog{},
		&models.SystemSetting{},
	)
	if err != nil {
		log.Fatal("Failed to migrate database:", err)
	}
}

func GetDB() *gorm.DB {
	return DB
}
