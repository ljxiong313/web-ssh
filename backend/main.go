package main

import (
	"log"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"webssh-backend/config"
	"webssh-backend/handlers"
	"webssh-backend/middleware"
)

func main() {
	config.InitEnv()
	config.InitDB()
	middleware.InitJWTSecret()

	r := gin.Default()

	r.Use(func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && (config.MVPMode || config.IsAllowedOrigin(origin)) {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Workspace-ID")
		c.Writer.Header().Set("X-Content-Type-Options", "nosniff")
		c.Writer.Header().Set("X-Frame-Options", "DENY")
		c.Writer.Header().Set("X-XSS-Protection", "1; mode=block")
		c.Writer.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	api := r.Group("/api")
	{
		// Auth (Community)
		api.POST("/auth/register", middleware.LoginRateLimit(), handlers.Register)
		api.POST("/auth/login", middleware.LoginRateLimit(), handlers.Login)
		api.POST("/auth/refresh", handlers.RefreshToken)
		api.POST("/auth/logout", middleware.AuthMiddleware(), handlers.Logout)
		api.POST("/auth/reset-password", middleware.LoginRateLimit(), handlers.ResetPassword)

		// Public settings (no auth required)
		api.GET("/settings/public", handlers.GetPublicSettings)

		authorized := api.Group("", middleware.AuthMiddleware())
		{
			authorized.GET("/profile", handlers.GetProfile)
			authorized.PUT("/profile", handlers.UpdateProfile)

			// Connections (Community)
			authorized.GET("/connections", middleware.WorkspaceMiddleware(), handlers.GetConnections)
			authorized.GET("/connections/:id", middleware.WorkspaceMiddleware(), handlers.GetConnection)
			authorized.POST("/connections", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.CreateConnection)
			authorized.PUT("/connections/:id", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.UpdateConnection)
			authorized.DELETE("/connections/:id", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.DeleteConnection)
			authorized.POST("/connections/:id/move", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.MoveConnection)
			authorized.POST("/connections/:id/test", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.TestConnection)
			authorized.POST("/connections/reorder", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.ReorderConnections)
			authorized.GET("/connections/export", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), handlers.ExportConnections)
			authorized.POST("/connections/import", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.ImportConnections)
			authorized.POST("/connections/import/preview", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.ImportConnectionsPreview)

			// Folders (Community)
			authorized.GET("/folders", middleware.WorkspaceMiddleware(), handlers.GetFolders)
			authorized.POST("/folders", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.CreateFolder)
			authorized.PUT("/folders/:id", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.UpdateFolder)
			authorized.DELETE("/folders/:id", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.DeleteFolder)
			authorized.POST("/folders/reorder", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.ReorderFolders)

			// Quick commands (Community)
			authorized.GET("/quick-commands", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), handlers.GetQuickCommands)
			authorized.POST("/quick-commands", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.CreateQuickCommand)
			authorized.PUT("/quick-commands/:id", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.UpdateQuickCommand)
			authorized.DELETE("/quick-commands/:id", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), middleware.RequireResourcePermission(middleware.RoleOperator), handlers.DeleteQuickCommand)
			authorized.POST("/quick-commands/:id/use", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), handlers.UseQuickCommand)

			// Command history (Community)
			authorized.GET("/command-history", handlers.GetCommandHistory)
			authorized.POST("/command-history", handlers.CreateCommandHistory)
			authorized.DELETE("/command-history", handlers.DeleteCommandHistory)

			// Connection logs (Community)
			authorized.GET("/connection-logs", handlers.GetConnectionLogs)
			authorized.GET("/connection-logs/export/csv", handlers.ExportConnectionLogsCSV)
			authorized.DELETE("/connection-logs", handlers.DeleteConnectionLogs)

			// Terminal sessions (Community)
			authorized.GET("/terminal-sessions", handlers.GetTerminalSessions)
			authorized.GET("/terminal-sessions/:id", handlers.GetTerminalSession)
			authorized.POST("/terminal-sessions", handlers.CreateTerminalSession)
			authorized.DELETE("/terminal-sessions/:id", handlers.DeleteTerminalSession)

			// Terminal theme (Community)
			authorized.GET("/terminal-theme", handlers.GetTerminalTheme)
			authorized.POST("/terminal-theme", handlers.SaveTerminalTheme)

			// SFTP (Community)
			authorized.GET("/sftp/:connId/list", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), handlers.HandleSFTPList)
			authorized.GET("/sftp/:connId/download", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), handlers.HandleSFTPDownload)
			authorized.GET("/sftp/:connId/download-dir", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), handlers.HandleSFTPDownloadDir)
			authorized.POST("/sftp/:connId/upload", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), handlers.HandleSFTPUpload)
			authorized.DELETE("/sftp/:connId/delete", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), handlers.HandleSFTPDelete)
			authorized.POST("/sftp/:connId/mkdir", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), handlers.HandleSFTPMkdir)
			authorized.POST("/sftp/:connId/chmod", middleware.WorkspaceMiddleware(), middleware.RBACMiddleware(middleware.RoleAdmin, middleware.RoleOperator, middleware.RoleViewer), handlers.HandleSFTPChmod)
		}
	}

	// Terminal websocket (Community)
	r.GET("/ws/terminal/:connId", middleware.AuthMiddleware(), middleware.WorkspaceMiddleware(), handlers.HandleTerminal)

	// Serve frontend static files (Docker / production deployment)
	if _, err := os.Stat("./frontend"); err == nil {
		r.Static("/assets", "./frontend/assets")
		r.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/ws") {
				c.JSON(404, gin.H{"error": "Not found"})
				return
			}
			c.File("./frontend/index.html")
		})
	}

	log.Println("Server starting on :37581")
	if err := r.Run(":37581"); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
