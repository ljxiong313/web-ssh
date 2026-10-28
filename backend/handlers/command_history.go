package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"webssh-backend/middleware"
	"webssh-backend/models"
	"webssh-backend/repositories"
)

func GetCommandHistory(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := currentWorkspaceID(c)

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	connectionID, _ := strconv.ParseUint(c.Query("connection_id"), 10, 32)

	history, err := repositories.GetCommandHistories(userID, workspaceID, uint(connectionID), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, history)
}

func CreateCommandHistory(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req struct {
		ConnectionID uint   `json:"connection_id"`
		Command      string `json:"command" binding:"required"`
		SessionID    string `json:"session_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	history := models.CommandHistory{
		UserID:       userID,
		WorkspaceID:  currentWorkspaceID(c),
		ConnectionID: req.ConnectionID,
		Command:      req.Command,
		SessionID:    req.SessionID,
	}

	if err := repositories.CreateCommandHistory(&history); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, history)
}

func DeleteCommandHistory(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := currentWorkspaceID(c)

	if err := repositories.DeleteCommandHistoriesByUserID(userID, workspaceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Command history cleared"})
}
