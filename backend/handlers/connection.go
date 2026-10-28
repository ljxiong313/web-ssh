package handlers

import (
	"crypto/rand"
	"encoding/json"
	"math/big"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"webssh-backend/config"
	"webssh-backend/middleware"
	"webssh-backend/models"
	"webssh-backend/repositories"
	"webssh-backend/services"
	"webssh-backend/utils"
)

func GetConnections(c *gin.Context) {
	userID := middleware.GetUserID(c)

	workspaceID := currentWorkspaceID(c)

	connections, err := repositories.GetConnections(userID, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, connections)
}

func GetConnection(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	connection, err := repositories.GetConnectionByIDWithFolder(uint(id), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	c.JSON(http.StatusOK, connection)
}

func CreateConnection(c *gin.Context) {
	userID := middleware.GetUserID(c)

	// 兜底校验：viewer 不能创建
	if role, exists := c.Get("workspaceRole"); exists {
		if r, ok := role.(string); ok && r == middleware.RoleViewer {
			c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
			return
		}
	}

	var req struct {
		Name        string `json:"name" binding:"required"`
		Host        string `json:"host" binding:"required"`
		Port        int    `json:"port"`
		Username    string `json:"username" binding:"required"`
		AuthType    string `json:"auth_type"`
		Password    string `json:"password"`
		PrivateKey  string `json:"private_key"`
		FolderID    *uint  `json:"folder_id"`
		WorkspaceID *uint  `json:"workspace_id"`
		SortOrder   int    `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Port == 0 {
		req.Port = 22
	}
	if req.AuthType == "" {
		req.AuthType = "password"
	}

	// 从请求头 X-Workspace-ID 读取 workspace_id，如果存在则写入
	// Workspace 归属以请求作用域为准（X-Workspace-ID，缺省回退个人 Workspace），
	// 避免请求体里的 workspace_id 指向用户未选中的 Workspace
	if wsID := currentWorkspaceID(c); wsID != nil {
		req.WorkspaceID = wsID
	}

	var encryptedPassword, encryptedKey string
	if req.Password != "" {
		encryptedPassword, _ = utils.Encrypt(req.Password, config.EncryptionKey)
	}
	if req.PrivateKey != "" {
		encryptedKey, _ = utils.Encrypt(req.PrivateKey, config.EncryptionKey)
	}

	connection := models.Connection{
		UserID:      userID,
		Name:        req.Name,
		Host:        req.Host,
		Port:        req.Port,
		Username:    req.Username,
		AuthType:    req.AuthType,
		Password:    encryptedPassword,
		PrivateKey:  encryptedKey,
		FolderID:    req.FolderID,
		WorkspaceID: req.WorkspaceID,
		SortOrder:   req.SortOrder,
	}

	if err := repositories.CreateConnection(&connection); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, connection)
}

func UpdateConnection(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	connection, err := repositories.GetConnectionByID(uint(id), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	// 权限检查：viewer 不能修改
	if role, exists := c.Get("workspaceRole"); exists {
		if r, ok := role.(string); ok && r == middleware.RoleViewer {
			c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
			return
		}
	}

	var req struct {
		Name       string `json:"name"`
		Host       string `json:"host"`
		Port       int    `json:"port"`
		Username   string `json:"username"`
		AuthType   string `json:"auth_type"`
		Password   string `json:"password"`
		PrivateKey string `json:"private_key"`
		FolderID   *uint  `json:"folder_id"`
		SortOrder  *int   `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != "" {
		connection.Name = req.Name
	}
	if req.Host != "" {
		connection.Host = req.Host
	}
	if req.Port != 0 {
		connection.Port = req.Port
	}
	if req.Username != "" {
		connection.Username = req.Username
	}
	if req.AuthType != "" {
		connection.AuthType = req.AuthType
	}
	if req.Password != "" {
		connection.Password, _ = utils.Encrypt(req.Password, config.EncryptionKey)
	}
	if req.PrivateKey != "" {
		connection.PrivateKey, _ = utils.Encrypt(req.PrivateKey, config.EncryptionKey)
	}
	if req.FolderID != nil {
		connection.FolderID = req.FolderID
	}
	// 排序仅在请求显式携带时更新，避免局部更新（如仅改密码）把拖拽顺序清零
	if req.SortOrder != nil {
		connection.SortOrder = *req.SortOrder
	}

	if err := repositories.SaveConnection(connection); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, connection)
}

func DeleteConnection(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	if _, err := repositories.GetConnectionByID(uint(id), userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	// 权限检查：viewer 不能删除
	if role, exists := c.Get("workspaceRole"); exists {
		if r, ok := role.(string); ok && r == middleware.RoleViewer {
			c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
			return
		}
	}

	if err := repositories.DeleteConnection(uint(id), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Connection deleted"})
}

func generateSecurePassword(length int) string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
	b := make([]byte, length)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		if err != nil {
			b[i] = chars[i%len(chars)]
			continue
		}
		b[i] = chars[n.Int64()]
	}
	return string(b)
}

func MoveConnection(c *gin.Context) {
	userID := middleware.GetUserID(c)

	// 兜底校验：viewer 不能移动
	if role, exists := c.Get("workspaceRole"); exists {
		if r, ok := role.(string); ok && r == middleware.RoleViewer {
			c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
			return
		}
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var req struct {
		FolderID *uint `json:"folder_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	connection, err := repositories.GetConnectionByID(uint(id), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	connection.FolderID = req.FolderID
	if err := repositories.SaveConnection(connection); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, connection)
}

func ReorderConnections(c *gin.Context) {
	userID := middleware.GetUserID(c)

	// 兜底校验：viewer 不能重新排序
	if role, exists := c.Get("workspaceRole"); exists {
		if r, ok := role.(string); ok && r == middleware.RoleViewer {
			c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
			return
		}
	}

	var req struct {
		Orders []struct {
			ID        uint `json:"id"`
			SortOrder int  `json:"sort_order"`
		} `json:"orders" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tx := config.GetDB().Begin()
	for _, order := range req.Orders {
		if err := repositories.UpdateConnectionSortOrder(tx, order.ID, userID, order.SortOrder); err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"message": "Connections reordered"})
}

func ExportConnections(c *gin.Context) {
	userID := middleware.GetUserID(c)

	workspaceID := currentWorkspaceID(c)

	connections, err := repositories.GetConnectionsForExport(userID, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	exportData := make([]map[string]interface{}, 0)
	for _, conn := range connections {
		password, _ := utils.Decrypt(conn.Password, config.EncryptionKey)
		privateKey, _ := utils.Decrypt(conn.PrivateKey, config.EncryptionKey)
		exportData = append(exportData, map[string]interface{}{
			"name":        conn.Name,
			"host":        conn.Host,
			"port":        conn.Port,
			"username":    conn.Username,
			"auth_type":   conn.AuthType,
			"password":    password,
			"private_key": privateKey,
			"folder_id":   conn.FolderID,
			"sort_order":  conn.SortOrder,
		})
	}

	c.Header("Content-Type", "application/json")
	c.Header("Content-Disposition", "attachment; filename=connections.json")
	c.JSON(http.StatusOK, exportData)
}

func ImportConnectionsPreview(c *gin.Context) {
	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File is required"})
		return
	}
	defer file.Close()

	var connections []map[string]interface{}
	if err := json.NewDecoder(file).Decode(&connections); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON format"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"count": len(connections), "connections": connections})
}

func ImportConnections(c *gin.Context) {
	userID := middleware.GetUserID(c)

	// 兜底校验：viewer 不能导入
	if role, exists := c.Get("workspaceRole"); exists {
		if r, ok := role.(string); ok && r == middleware.RoleViewer {
			c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
			return
		}
	}

	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File is required"})
		return
	}
	defer file.Close()

	var importData []struct {
		Name       string `json:"name"`
		Host       string `json:"host"`
		Port       int    `json:"port"`
		Username   string `json:"username"`
		AuthType   string `json:"auth_type"`
		Password   string `json:"password"`
		PrivateKey string `json:"private_key"`
		FolderID   *uint  `json:"folder_id"`
		SortOrder  int    `json:"sort_order"`
	}

	if err := json.NewDecoder(file).Decode(&importData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON format"})
		return
	}

	workspaceID := currentWorkspaceID(c)

	var imported int
	for _, data := range importData {
		if data.Name == "" || data.Host == "" || data.Username == "" {
			continue
		}
		if data.Port == 0 {
			data.Port = 22
		}
		if data.AuthType == "" {
			data.AuthType = "password"
		}
		// 导入文件里的 folder_id 属于导出时的环境，只有仍属于当前用户与当前 Workspace 时才保留
		if data.FolderID != nil {
			if folder, err := repositories.GetFolderByIDAndUserID(*data.FolderID, userID); err != nil || !sameWorkspaceScope(folder.WorkspaceID, workspaceID) {
				data.FolderID = nil
			}
		}

		var encryptedPassword, encryptedKey string
		if data.Password != "" {
			encryptedPassword, _ = utils.Encrypt(data.Password, config.EncryptionKey)
		}
		if data.PrivateKey != "" {
			encryptedKey, _ = utils.Encrypt(data.PrivateKey, config.EncryptionKey)
		}

		connection := models.Connection{
			UserID:      userID,
			WorkspaceID: workspaceID,
			Name:        data.Name,
			Host:        data.Host,
			Port:        data.Port,
			Username:    data.Username,
			AuthType:    data.AuthType,
			Password:    encryptedPassword,
			PrivateKey:  encryptedKey,
			FolderID:    data.FolderID,
			SortOrder:   data.SortOrder,
		}

		if err := repositories.CreateConnection(&connection); err == nil {
			imported++
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Connections imported", "imported": imported})
}

func TestConnection(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	connection, err := repositories.GetConnectionByID(uint(id), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	connInfo := decryptConnection(connection)

	start := time.Now()
	sshClient, err := services.NewSSHClient(connInfo)
	duration := time.Since(start)

	log := models.ConnectionLog{
		UserID:      userID,
		ConnName:    connection.Name,
		Host:        connection.Host,
		Username:    connection.Username,
		ConnectedAt: start,
		Duration:    int64(duration.Seconds()),
	}

	if err != nil {
		log.Status = "failed"
		log.ErrMsg = err.Error()
		repositories.CreateConnectionLog(&log)
		c.JSON(http.StatusOK, gin.H{"success": false, "error": err.Error(), "duration_ms": duration.Milliseconds()})
		return
	}
	defer sshClient.Close()

	log.Status = "success"
	repositories.CreateConnectionLog(&log)

	c.JSON(http.StatusOK, gin.H{"success": true, "duration_ms": duration.Milliseconds()})
}

func decryptConnection(conn *models.Connection) *services.ConnectionInfo {
	password, _ := utils.Decrypt(conn.Password, config.EncryptionKey)
	if password == "" {
		password = conn.Password
	}
	privateKey, _ := utils.Decrypt(conn.PrivateKey, config.EncryptionKey)
	if privateKey == "" {
		privateKey = conn.PrivateKey
	}
	return &services.ConnectionInfo{
		Host:       conn.Host,
		Port:       conn.Port,
		Username:   conn.Username,
		AuthType:   conn.AuthType,
		Password:   password,
		PrivateKey: privateKey,
	}
}
