package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"webssh-backend/middleware"
	"webssh-backend/models"
	"webssh-backend/repositories"
)

func GetTerminalTheme(c *gin.Context) {
	userID := middleware.GetUserID(c)

	theme, err := repositories.GetTerminalThemeByUserID(userID)
	if err != nil {
		theme = models.TerminalTheme{
			UserID:          userID,
			FontFamily:      "Monaco, monospace",
			FontSize:        14,
			ForegroundColor: "#ffffff",
			BackgroundColor: "#1e1e1e",
			CursorColor:     "#ffffff",
			SelectionColor:  "#264f78",
		}
		repositories.CreateTerminalTheme(&theme)
	}

	c.JSON(http.StatusOK, theme)
}

func SaveTerminalTheme(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req struct {
		FontFamily      string `json:"font_family"`
		FontSize        int    `json:"font_size"`
		ForegroundColor string `json:"foreground_color"`
		BackgroundColor string `json:"background_color"`
		CursorColor     string `json:"cursor_color"`
		SelectionColor  string `json:"selection_color"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	theme, err := repositories.GetTerminalThemeByUserID(userID)

	if err != nil {
		theme = models.TerminalTheme{
			UserID:          userID,
			FontFamily:      req.FontFamily,
			FontSize:        req.FontSize,
			ForegroundColor: req.ForegroundColor,
			BackgroundColor: req.BackgroundColor,
			CursorColor:     req.CursorColor,
			SelectionColor:  req.SelectionColor,
		}
		if err := repositories.CreateTerminalTheme(&theme); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		if req.FontFamily != "" {
			theme.FontFamily = req.FontFamily
		}
		if req.FontSize != 0 {
			theme.FontSize = req.FontSize
		}
		if req.ForegroundColor != "" {
			theme.ForegroundColor = req.ForegroundColor
		}
		if req.BackgroundColor != "" {
			theme.BackgroundColor = req.BackgroundColor
		}
		if req.CursorColor != "" {
			theme.CursorColor = req.CursorColor
		}
		if req.SelectionColor != "" {
			theme.SelectionColor = req.SelectionColor
		}
		if err := repositories.SaveTerminalTheme(&theme); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, theme)
}
