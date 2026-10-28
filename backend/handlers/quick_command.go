package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"webssh-backend/middleware"
	"webssh-backend/models"
	"webssh-backend/repositories"
)

func GetQuickCommands(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := currentWorkspaceID(c)

	commands, err := repositories.GetQuickCommands(userID, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, commands)
}

func CreateQuickCommand(c *gin.Context) {
	userID := middleware.GetUserID(c)

	// 兜底校验：viewer 不能创建
	if role, exists := c.Get("workspaceRole"); exists {
		if r, ok := role.(string); ok && r == middleware.RoleViewer {
			c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
			return
		}
	}

	var req struct {
		Name    string `json:"name" binding:"required"`
		Command string `json:"command" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	qc := models.QuickCommand{
		UserID:      userID,
		WorkspaceID: currentWorkspaceID(c),
		Name:        req.Name,
		Command:     req.Command,
	}

	if err := repositories.CreateQuickCommand(&qc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, qc)
}

func UpdateQuickCommand(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	qc, err := repositories.GetQuickCommandByID(uint(id), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quick command not found"})
		return
	}

	var req struct {
		Name    string `json:"name"`
		Command string `json:"command"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != "" {
		qc.Name = req.Name
	}
	if req.Command != "" {
		qc.Command = req.Command
	}

	if err := repositories.SaveQuickCommand(qc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, qc)
}

func DeleteQuickCommand(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	if err := repositories.DeleteQuickCommand(uint(id), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Quick command deleted"})
}

func UseQuickCommand(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	qc, err := repositories.GetQuickCommandByID(uint(id), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quick command not found"})
		return
	}

	qc.UseCount++
	if err := repositories.SaveQuickCommand(qc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, qc)
}
