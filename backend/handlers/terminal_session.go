package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"webssh-backend/middleware"
	"webssh-backend/models"
	"webssh-backend/repositories"
)

func GetTerminalSessions(c *gin.Context) {
	userID := middleware.GetUserID(c)

	sessions, err := repositories.GetTerminalSessionsByUserID(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, sessions)
}

func GetTerminalSession(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	session, err := repositories.GetTerminalSessionByIDAndUserID(uint(id), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	c.JSON(http.StatusOK, session)
}

func CreateTerminalSession(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req struct {
		ConnectionID uint   `json:"connection_id" binding:"required"`
		ConnName     string `json:"conn_name" binding:"required"`
		Content      string `json:"content"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	session := models.TerminalSession{
		UserID:       userID,
		ConnectionID: req.ConnectionID,
		ConnName:     req.ConnName,
		Content:      req.Content,
		SavedAt:      time.Now(),
	}

	if err := repositories.CreateTerminalSession(&session); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, session)
}

func DeleteTerminalSession(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	if err := repositories.DeleteTerminalSessionByIDAndUserID(uint(id), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Session deleted"})
}
