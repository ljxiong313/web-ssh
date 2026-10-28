package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
	"webssh-backend/config"
	"webssh-backend/models"
)

var jwtSecret []byte

func InitJWTSecret() {
	jwtSecret = []byte(config.JWTSecret)
}

func GenerateToken(userID uint, email string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"exp":     time.Now().Add(config.AccessTokenExpiry).Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

func GenerateRefreshToken(userID uint) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID,
		"type":    "refresh",
		"exp":     time.Now().Add(config.RefreshTokenExpiry).Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

func ParseToken(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return nil, err
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid claims")
	}
	return claims, nil
}

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenString string

		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
				tokenString = parts[1]
			}
		}

		if tokenString == "" {
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization required"})
			c.Abort()
			return
		}

		claims, err := ParseToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		userID, ok := claims["user_id"].(float64)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
			return
		}

		var user models.User
		if err := config.GetDB().First(&user, uint(userID)).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			c.Abort()
			return
		}

		if user.Status == "disabled" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Account disabled"})
			c.Abort()
			return
		}

		if user.Status == "locked" && user.LockedUntil != nil && user.LockedUntil.After(time.Now()) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Account locked"})
			c.Abort()
			return
		}

		c.Set("userID", uint(userID))
		c.Set("email", claims["email"])
		c.Set("userStatus", user.Status)
		c.Next()
	}
}

func GetUserID(c *gin.Context) uint {
	userID, exists := c.Get("userID")
	if !exists {
		return 0
	}
	return userID.(uint)
}

func HashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

func SaveRefreshToken(userID uint, token string, db ...*gorm.DB) error {
	tokenHash := HashToken(token)
	family := hex.EncodeToString(hashTokenFamily(userID))

	rt := models.RefreshToken{
		UserID:    userID,
		TokenHash: tokenHash,
		Family:    family,
		ExpiresAt: time.Now().Add(config.RefreshTokenExpiry),
	}
	dbConn := config.GetDB()
	if len(db) > 0 && db[0] != nil {
		dbConn = db[0]
	}
	return dbConn.Create(&rt).Error
}

func ValidateRefreshToken(userID uint, token string) bool {
	tokenHash := HashToken(token)
	var rt models.RefreshToken
	if err := config.GetDB().Where("user_id = ? AND token_hash = ?", userID, tokenHash).First(&rt).Error; err != nil {
		return false
	}
	return rt.ExpiresAt.After(time.Now())
}

func RevokeRefreshToken(token string, db ...*gorm.DB) error {
	tokenHash := HashToken(token)
	dbConn := config.GetDB()
	if len(db) > 0 && db[0] != nil {
		dbConn = db[0]
	}
	return dbConn.Where("token_hash = ?", tokenHash).Delete(&models.RefreshToken{}).Error
}

func RevokeAllUserRefreshTokens(userID uint) error {
	return config.GetDB().Where("user_id = ?", userID).Delete(&models.RefreshToken{}).Error
}

func hashTokenFamily(userID uint) []byte {
	h := sha256.New()
	h.Write([]byte(fmt.Sprintf("family:%d:%s", userID, config.JWTSecret)))
	return h.Sum(nil)
}
