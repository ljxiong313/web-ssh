package middleware

import "github.com/gin-gonic/gin"

// CurrentWorkspaceID 返回本次请求解析出的 Workspace ID（由 WorkspaceMiddleware 注入，
// 未携带 X-Workspace-ID 时回退为用户的个人 Workspace）。
func CurrentWorkspaceID(c *gin.Context) (uint, bool) {
	vid, exists := c.Get("workspaceID")
	if !exists {
		return 0, false
	}
	id, ok := vid.(uint)
	return id, ok && id != 0
}
