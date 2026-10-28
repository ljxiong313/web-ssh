package middleware

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"webssh-backend/config"
	"webssh-backend/models"
)

const (
	RoleAdmin    = "admin"
	RoleOperator = "operator"
	RoleViewer   = "viewer"
)

// RBACMiddleware 按 Workspace 成员角色进行鉴权。
// 优先从 gin context 读取 "workspaceID"（由 WorkspaceMiddleware 注入），
// 否则从 URL 参数 "id" 解析 workspace ID。
// In MVP mode, bypasses workspace membership checks for development preview.
func RBACMiddleware(allowedRoles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := GetUserID(c)
		if userID == 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}

		if config.MVPMode {
			c.Set("role", RoleAdmin)
			c.Set("workspaceRole", RoleAdmin)
			c.Next()
			return
		}

		workspaceIDStr := ""
		if wid, exists := c.Get("workspaceID"); exists {
			workspaceIDStr = strconv.FormatUint(uint64(wid.(uint)), 10)
		}
		if workspaceIDStr == "" {
			workspaceIDStr = c.Param("id")
		}
		if workspaceIDStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Workspace ID required"})
			c.Abort()
			return
		}

		workspaceID, err := strconv.ParseUint(workspaceIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
			c.Abort()
			return
		}

		var member models.WorkspaceMember
		if err := config.GetDB().Where("workspace_id = ? AND user_id = ?", workspaceID, userID).First(&member).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			c.Abort()
			return
		}

		for _, r := range allowedRoles {
			if r == member.Role {
				c.Set("role", member.Role)
				c.Set("workspaceRole", member.Role)
				c.Next()
				return
			}
		}

		c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
		c.Abort()
	}
}

// WorkspaceMiddleware 解析本次请求作用的 Workspace：
// 优先取请求头 X-Workspace-ID，缺失或非法时回退到用户的个人 Workspace。
// 回退保证社区版/免费用户在未选择 Workspace 时依然能使用快捷命令等本版本功能。
func WorkspaceMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetHeader("X-Workspace-ID")
		if workspaceID != "" {
			if id, err := strconv.ParseUint(workspaceID, 10, 32); err == nil {
				c.Set("workspaceID", uint(id))
				c.Next()
				return
			}
		}
		if userID := GetUserID(c); userID != 0 {
			if id, err := personalWorkspaceID(userID); err == nil {
				c.Set("workspaceID", id)
			}
		}
		c.Next()
	}
}

// personalWorkspaceID 返回用户的个人 Workspace：优先其拥有的第一个，
// 仅作为成员加入的用户退回到最早加入的 Workspace。
func personalWorkspaceID(userID uint) (uint, error) {
	var workspace models.Workspace
	if err := config.GetDB().Where("owner_id = ?", userID).Order("id asc").First(&workspace).Error; err == nil {
		return workspace.ID, nil
	}
	var member models.WorkspaceMember
	if err := config.GetDB().Where("user_id = ?", userID).Order("workspace_id asc").First(&member).Error; err != nil {
		return 0, err
	}
	return member.WorkspaceID, nil
}

// roleRank 定义角色等级，数字越大权限越高。
var roleRank = map[string]int{
	RoleViewer:   1,
	RoleOperator: 2,
	RoleAdmin:    3,
}

// HasResourceAccess 判断 userRole 是否满足 required 最低角色要求。
func HasResourceAccess(userRole, required string) bool {
	ur, ok1 := roleRank[userRole]
	rr, ok2 := roleRank[required]
	if !ok1 || !ok2 {
		return false
	}
	return ur >= rr
}

// RequireResourcePermission 中间件，用于资源级权限控制。
// 从 context 读取 workspaceRole（由 RBACMiddleware 或 WorkspaceMiddleware 注入），
// 若角色不满足 minRole 则拒绝访问。
func RequireResourcePermission(minRole string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("workspaceRole")
		if !exists {
			// 没有 workspaceRole 时，检查是否携带了 X-Workspace-ID 请求头
			// 如果携带了但不是 Workspace 成员（RBACMiddleware 未设置 workspaceRole），则拒绝
			if workspaceID := c.GetHeader("X-Workspace-ID"); workspaceID != "" {
				c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
				c.Abort()
				return
			}
			// 没有 workspaceRole 且没有 X-Workspace-ID，说明是个人资源，允许操作
			c.Next()
			return
		}

		userRole, ok := role.(string)
		if !ok || !HasResourceAccess(userRole, minRole) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
			c.Abort()
			return
		}
		c.Next()
	}
}
