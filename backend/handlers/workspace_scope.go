package handlers

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"webssh-backend/middleware"
)

// currentWorkspaceID 返回本次请求作用域内的 Workspace ID，未确定时返回 nil（表示个人资源）。
// 优先使用 WorkspaceMiddleware 注入的值（无 X-Workspace-ID 时已回退为用户的个人 Workspace），
// 以便快捷命令等资源在没有请求头的情况下也能归属到正确的 Workspace。
// 未经过 WorkspaceMiddleware 的路由仍按请求头解析。
func currentWorkspaceID(c *gin.Context) *uint {
	if id, ok := middleware.CurrentWorkspaceID(c); ok {
		return &id
	}
	if raw := c.GetHeader("X-Workspace-ID"); raw != "" {
		if wid, err := strconv.ParseUint(raw, 10, 32); err == nil {
			w := uint(wid)
			return &w
		}
	}
	return nil
}

// sameWorkspaceScope 判断资源所属 Workspace 与请求作用域是否一致；
// 两侧都为 nil（个人资源）视为一致。
func sameWorkspaceScope(resourceWorkspaceID, scopeWorkspaceID *uint) bool {
	if resourceWorkspaceID == nil || scopeWorkspaceID == nil {
		return resourceWorkspaceID == nil && scopeWorkspaceID == nil
	}
	return *resourceWorkspaceID == *scopeWorkspaceID
}
