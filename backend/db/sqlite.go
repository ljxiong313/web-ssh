package db

import (
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func newSQLiteDialector(cfg Config, _ logger.Interface) (gorm.Dialector, error) {
	if err := os.MkdirAll(cfg.DataDir, 0750); err != nil {
		return nil, err
	}
	dbPath := filepath.Join(cfg.DataDir, "webssh.db")
	return sqlite.Open(dbPath), nil
}
