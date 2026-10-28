package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"webssh-backend/config"
	"webssh-backend/middleware"
	"webssh-backend/models"
	"webssh-backend/repositories"
	"webssh-backend/utils"
)

func Register(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required,min=8"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !utils.ValidatePasswordStrength(req.Password) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must contain at least 8 characters, including uppercase, lowercase, and numbers"})
		return
	}

	_, err := repositories.GetUserByEmail(req.Email)
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already registered"})
		return
	}

	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	user := models.User{
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: hashedPassword,
		Status:       "active",
	}

	if err := repositories.CreateUser(&user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	// 自动创建个人 Workspace
	ensurePersonalWorkspace(user.ID)

	token, err := middleware.GenerateToken(user.ID, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	refreshToken, err := middleware.GenerateRefreshToken(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate refresh token"})
		return
	}

	if err := middleware.SaveRefreshToken(user.ID, refreshToken); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save refresh token"})
		return
	}

	createAuditLog(user.ID, "register", "user", user.ID, "User registered", c.ClientIP(), c.GetHeader("User-Agent"), true)

	c.JSON(http.StatusCreated, gin.H{
		"token":         token,
		"refresh_token": refreshToken,
		"user": gin.H{
			"id":       user.ID,
			"email":    user.Email,
			"username": user.Username,
		},
	})
}

func Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := repositories.GetUserByEmail(req.Email)
	if err != nil {
		middleware.RecordFailedLogin(c.ClientIP())
		createAuditLog(0, "login", "user", 0, "Invalid email", c.ClientIP(), c.GetHeader("User-Agent"), false)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	if user.Status == "disabled" {
		createAuditLog(user.ID, "login", "user", user.ID, "Account disabled", c.ClientIP(), c.GetHeader("User-Agent"), false)
		c.JSON(http.StatusForbidden, gin.H{"error": "Account disabled"})
		return
	}

	if user.Status == "locked" && user.LockedUntil != nil && user.LockedUntil.After(time.Now()) {
		createAuditLog(user.ID, "login", "user", user.ID, "Account locked", c.ClientIP(), c.GetHeader("User-Agent"), false)
		c.JSON(http.StatusForbidden, gin.H{"error": "Account locked, please try again later"})
		return
	}

	if !utils.CheckPassword(req.Password, user.PasswordHash) {
		middleware.RecordFailedLogin(c.ClientIP())
		user.LoginAttempts++
		if user.LoginAttempts >= 5 {
			lockUntil := time.Now().Add(30 * time.Minute)
			user.LockedUntil = &lockUntil
			user.Status = "locked"
		}
		repositories.SaveUser(&user)
		createAuditLog(user.ID, "login", "user", user.ID, "Invalid password", c.ClientIP(), c.GetHeader("User-Agent"), false)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	middleware.ClearLoginAttempts(c.ClientIP())
	user.LoginAttempts = 0
	user.LockedUntil = nil
	user.Status = "active"
	now := time.Now()
	user.LastLoginAt = &now
	repositories.SaveUser(&user)

	// 为现有用户自动创建个人 Workspace（如果不存在）
	ensurePersonalWorkspace(user.ID)

	token, err := middleware.GenerateToken(user.ID, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	refreshToken, err := middleware.GenerateRefreshToken(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate refresh token"})
		return
	}

	if err := middleware.SaveRefreshToken(user.ID, refreshToken); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save refresh token"})
		return
	}

	createAuditLog(user.ID, "login", "user", user.ID, "Login successful", c.ClientIP(), c.GetHeader("User-Agent"), true)

	c.JSON(http.StatusOK, gin.H{
		"token":         token,
		"refresh_token": refreshToken,
		"user": gin.H{
			"id":       user.ID,
			"email":    user.Email,
			"username": user.Username,
		},
	})
}

func RefreshToken(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	claims, err := middleware.ParseToken(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid refresh token"})
		return
	}

	tokenType, ok := claims["type"].(string)
	if !ok || tokenType != "refresh" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token type"})
		return
	}

	userID, ok := claims["user_id"].(float64)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
		return
	}

	if !middleware.ValidateRefreshToken(uint(userID), req.RefreshToken) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token revoked"})
		return
	}

	user, err := repositories.GetUserByID(uint(userID))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	if user.Status == "disabled" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Account disabled"})
		return
	}

	token, err := middleware.GenerateToken(user.ID, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	newRefreshToken, err := middleware.GenerateRefreshToken(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate refresh token"})
		return
	}

	tx := config.GetDB().Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
		return
	}

	if err := middleware.RevokeRefreshToken(req.RefreshToken, tx); err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to revoke refresh token"})
		return
	}

	if err := middleware.SaveRefreshToken(user.ID, newRefreshToken, tx); err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save refresh token"})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transaction"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":         token,
		"refresh_token": newRefreshToken,
	})
}

func Logout(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	c.ShouldBindJSON(&req)

	if req.RefreshToken != "" {
		middleware.RevokeRefreshToken(req.RefreshToken)
	}

	createAuditLog(userID, "logout", "user", userID, "User logged out", c.ClientIP(), c.GetHeader("User-Agent"), true)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

func GetProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)

	user, err := repositories.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         user.ID,
		"email":      user.Email,
		"username":   user.Username,
		"status":     user.Status,
		"created_at": user.CreatedAt,
	})
}

func UpdateProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := repositories.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if req.Username != "" {
		user.Username = req.Username
	}
	if req.Email != "" {
		user.Email = req.Email
	}
	if req.Password != "" {
		if !utils.ValidatePasswordStrength(req.Password) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Password must contain at least 8 characters, including uppercase, lowercase, and numbers"})
			return
		}
		hashedPassword, err := utils.HashPassword(req.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
			return
		}
		user.PasswordHash = hashedPassword
		middleware.RevokeAllUserRefreshTokens(userID)
	}

	if err := repositories.SaveUser(&user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	createAuditLog(userID, "profile_update", "user", userID, "Profile updated", c.ClientIP(), c.GetHeader("User-Agent"), true)

	c.JSON(http.StatusOK, gin.H{
		"id":       user.ID,
		"email":    user.Email,
		"username": user.Username,
	})
}

func ResetPassword(c *gin.Context) {
	var req struct {
		Email       string `json:"email" binding:"required,email"`
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required,min=8"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := repositories.GetUserByEmail(req.Email)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if !utils.CheckPassword(req.OldPassword, user.PasswordHash) {
		createAuditLog(user.ID, "password_reset", "user", user.ID, "Invalid old password", c.ClientIP(), c.GetHeader("User-Agent"), false)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid old password"})
		return
	}

	if !utils.ValidatePasswordStrength(req.NewPassword) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must contain at least 8 characters, including uppercase, lowercase, and numbers"})
		return
	}

	hashedPassword, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	user.PasswordHash = hashedPassword
	repositories.SaveUser(&user)
	middleware.RevokeAllUserRefreshTokens(user.ID)

	createAuditLog(user.ID, "password_reset", "user", user.ID, "Password reset successful", c.ClientIP(), c.GetHeader("User-Agent"), true)

	c.JSON(http.StatusOK, gin.H{"message": "Password reset successfully"})
}

// GetPublicSettings returns public system settings that don't require authentication.
// Used by the login page to determine whether to show the registration option.
func GetPublicSettings(c *gin.Context) {
	setting, err := repositories.GetSystemSetting()
	if err != nil {
		// Default to allowing registration if settings not found
		c.JSON(http.StatusOK, gin.H{"allow_registration": true})
		return
	}
	c.JSON(http.StatusOK, gin.H{"allow_registration": setting.AllowRegistration})
}

func createAuditLog(userID uint, action, resource string, resourceID uint, details, ip, userAgent string, success bool) {
	repositories.CreateAuditLogWithParams(userID, action, resource, resourceID, details, ip, userAgent, success)
}

// ensurePersonalWorkspace 确保用户拥有个人 Workspace，如果不存在则自动创建。
// 用于新用户注册和现有用户登录时的数据迁移。
// 社区版只有一个 free Workspace，成员上限固定为 5。
func ensurePersonalWorkspace(userID uint) {
	members, err := repositories.GetWorkspaceMembersByUserID(userID)
	if err == nil && len(members) > 0 {
		return // 用户已有 Workspace，无需创建
	}
	workspace := models.Workspace{
		Name:       "个人空间",
		OwnerID:    userID,
		Plan:       "free",
		MaxMembers: 5,
		Status:     "active",
	}
	if err := repositories.CreateWorkspace(&workspace); err != nil {
		return
	}
	member := models.WorkspaceMember{
		WorkspaceID: workspace.ID,
		UserID:      userID,
		Role:        middleware.RoleAdmin,
		JoinedAt:    time.Now(),
	}
	repositories.CreateWorkspaceMember(&member)
}
