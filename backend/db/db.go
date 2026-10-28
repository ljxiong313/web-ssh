package db

import (
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Config holds database connection configuration.
// 社区版仅支持 SQLite，因此只需要数据目录。
type Config struct {
	Type    string
	DataDir string
}

// Open creates a new GORM DB connection based on the provided configuration.
func Open(cfg Config, gormLogger logger.Interface) (*gorm.DB, error) {
	if cfg.Type != "sqlite" {
		return nil, fmt.Errorf("unsupported database type: %s", cfg.Type)
	}

	dialector, err := newSQLiteDialector(cfg, gormLogger)
	if err != nil {
		return nil, err
	}

	db, err := gorm.Open(dialector, &gorm.Config{
		Logger: gormLogger,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	return db, nil
}
