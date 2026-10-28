package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"webssh-backend/config"
	"webssh-backend/middleware"
	"webssh-backend/models"
	"webssh-backend/repositories"
)

const MaxFolderDepth = 5

// buildFolderTree 将扁平列表转换为树结构（仅返回根节点）
func buildFolderTree(folders []models.Folder) []models.Folder {
	folderMap := make(map[uint]*models.Folder)
	for i := range folders {
		folderMap[folders[i].ID] = &folders[i]
		folders[i].Children = nil
	}

	for i := range folders {
		if folders[i].ParentID != nil {
			parent := folderMap[*folders[i].ParentID]
			if parent != nil {
				parent.Children = append(parent.Children, folders[i])
			}
		}
	}

	var roots []models.Folder
	for i := range folders {
		if folders[i].ParentID == nil {
			roots = append(roots, folders[i])
		}
	}
	return roots
}

func GetFolders(c *gin.Context) {
	userID := middleware.GetUserID(c)

	workspaceID := currentWorkspaceID(c)

	folders, err := repositories.GetFoldersByUserAndWorkspace(userID, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	tree := buildFolderTree(folders)
	c.JSON(http.StatusOK, tree)
}

func CreateFolder(c *gin.Context) {
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
		ParentID    *uint  `json:"parent_id"`
		WorkspaceID *uint  `json:"workspace_id"`
		SortOrder   int    `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Workspace 归属以请求作用域为准（X-Workspace-ID，缺省回退个人 Workspace）
	if wsID := currentWorkspaceID(c); wsID != nil {
		req.WorkspaceID = wsID
	}

	if req.ParentID != nil {
		_, err := repositories.GetFolderByIDAndUserID(*req.ParentID, userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Parent folder not found"})
			return
		}

		parentDepth, err := repositories.GetFolderDepth(*req.ParentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if parentDepth >= MaxFolderDepth {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Maximum folder depth exceeded (max 5 levels)"})
			return
		}
	}

	folder := models.Folder{
		UserID:      userID,
		Name:        req.Name,
		ParentID:    req.ParentID,
		WorkspaceID: req.WorkspaceID,
		SortOrder:   req.SortOrder,
	}

	if err := repositories.CreateFolder(&folder); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, folder)
}

func UpdateFolder(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	folder, err := repositories.GetFolderByIDAndUserID(uint(id), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
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
		Name      string `json:"name"`
		ParentID  *uint  `json:"parent_id"`
		SortOrder int    `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != "" {
		folder.Name = req.Name
	}

	if req.ParentID != nil {
		if *req.ParentID == uint(id) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot set parent to self"})
			return
		}

		_, err := repositories.GetFolderByIDAndUserID(*req.ParentID, userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Parent folder not found"})
			return
		}

		// 检查是否移动到自己的后代
		isDesc, err := repositories.IsDescendant(uint(id), *req.ParentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if isDesc {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot move folder to its descendant"})
			return
		}

		// 检查深度限制
		newParentDepth, err := repositories.GetFolderDepth(*req.ParentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		subtreeDepth, err := repositories.GetSubtreeDepth(uint(id))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if newParentDepth+subtreeDepth > MaxFolderDepth {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Moving this folder would exceed maximum depth (max 5 levels)"})
			return
		}

		folder.ParentID = req.ParentID
	}
	folder.SortOrder = req.SortOrder

	if err := repositories.SaveFolder(&folder); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, folder)
}

func DeleteFolder(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	_, err = repositories.GetFolderByIDAndUserID(uint(id), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}

	// 权限检查：viewer 不能删除
	if role, exists := c.Get("workspaceRole"); exists {
		if r, ok := role.(string); ok && r == middleware.RoleViewer {
			c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
			return
		}
	}

	tx := config.GetDB().Begin()
	if err := repositories.DeleteFolderRecursive(uint(id), userID, tx); err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"message": "Folder deleted"})
}

func ReorderFolders(c *gin.Context) {
	userID := middleware.GetUserID(c)

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
		if err := repositories.UpdateFolderSortOrder(order.ID, userID, order.SortOrder, tx); err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"message": "Folders reordered"})
}
