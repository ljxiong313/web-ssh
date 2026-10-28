package config

import (
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

var (
	JWTSecret          string
	AllowedOrigins     []string
	DataDir            string
	EncryptionKey      string
	AccessTokenExpiry  time.Duration
	RefreshTokenExpiry time.Duration
	MVPMode            bool
	FrontendURL        string
	DBType             string
)

func InitEnv() {
	exePath, err := os.Executable()
	if err == nil {
		envPath := filepath.Join(filepath.Dir(exePath), ".env")
		if _, err := os.Stat(envPath); err == nil {
			_ = godotenv.Load(envPath)
		} else {
			_ = godotenv.Load()
		}
	} else {
		_ = godotenv.Load()
	}

	JWTSecret = os.Getenv("JWT_SECRET")
	if len(JWTSecret) < 32 {
		log.Fatal("JWT_SECRET environment variable must be at least 32 characters")
	}

	origins := os.Getenv("ALLOWED_ORIGINS")
	if origins == "" {
		log.Fatal("ALLOWED_ORIGINS environment variable is required (e.g., http://localhost:5173)")
	}
	for _, o := range strings.Split(origins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			AllowedOrigins = append(AllowedOrigins, o)
		}
	}

	DataDir = os.Getenv("DATA_DIR")
	if DataDir == "" {
		DataDir = "./data"
	}

	EncryptionKey = os.Getenv("ENCRYPTION_KEY")
	if len(EncryptionKey) < 32 {
		log.Fatal("ENCRYPTION_KEY environment variable must be at least 32 characters")
	}

	AccessTokenExpiry = parseDurationEnv("ACCESS_TOKEN_EXPIRY", "30m")
	RefreshTokenExpiry = parseDurationEnv("REFRESH_TOKEN_EXPIRY", "7d")
	MVPMode = os.Getenv("MVP_MODE") == "true"

	FrontendURL = os.Getenv("FRONTEND_URL")
	if FrontendURL == "" {
		if len(AllowedOrigins) > 0 {
			FrontendURL = AllowedOrigins[0]
		} else {
			FrontendURL = "http://localhost:35780"
		}
	}

	// 社区版仅支持 SQLite；PostgreSQL / MySQL 不在本仓库的功能范围内。
	DBType = "sqlite"
}

func parseIntEnv(key string, defaultValue int) int {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	num, err := strconv.Atoi(value)
	if err != nil || num < 0 {
		log.Printf("Invalid integer format for %s: %s, using default %d", key, value, defaultValue)
		return defaultValue
	}
	return num
}

func parseDurationEnv(key, defaultValue string) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		value = defaultValue
	}

	if len(value) < 2 {
		log.Fatalf("Invalid duration format for %s: %s", key, value)
	}

	unit := value[len(value)-1]
	numStr := value[:len(value)-1]
	num, err := strconv.Atoi(numStr)
	if err != nil || num < 0 {
		log.Fatalf("Invalid duration format for %s: %s", key, value)
	}

	var d time.Duration
	switch unit {
	case 'm':
		d = time.Duration(num) * time.Minute
	case 'h':
		d = time.Duration(num) * time.Hour
	case 'd':
		d = time.Duration(num) * 24 * time.Hour
	default:
		log.Fatalf("Invalid duration unit for %s: %s (supported: m, h, d)", key, value)
	}
	return d
}

func IsAllowedOrigin(origin string) bool {
	for _, o := range AllowedOrigins {
		if o == origin {
			return true
		}
	}
	return false
}

func GetFrontendURL() string {
	return FrontendURL
}
