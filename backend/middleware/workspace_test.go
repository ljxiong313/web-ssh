package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"webssh-backend/config"
	"webssh-backend/models"
)

const (
	wsPersonal       = 1
	wsSharedWithUser = 2
	testUserID       = 1
	otherOwnerUserID = 2
)

// setupWorkspaceTestDB 准备一个只含 Workspace 相关表的内存库：
// 用户 1 拥有个人 Workspace，并以 viewer 身份加入用户 2 的另一个 Workspace。
func setupWorkspaceTestDB(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	dsn := fmt.Sprintf("file:ws_%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	database, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	if err := database.AutoMigrate(&models.User{}, &models.Workspace{}, &models.WorkspaceMember{}); err != nil {
		t.Fatalf("migrate test db: %v", err)
	}
	config.DB = database

	originalMVP := config.MVPMode
	config.MVPMode = false
	t.Cleanup(func() { config.MVPMode = originalMVP })

	users := []models.User{
		{ID: testUserID, Email: "alice@example.com", Username: "alice"},
		{ID: otherOwnerUserID, Email: "bob@example.com", Username: "bob"},
	}
	for i := range users {
		if err := database.Create(&users[i]).Error; err != nil {
			t.Fatalf("seed user: %v", err)
		}
	}

	workspaces := []models.Workspace{
		{ID: wsPersonal, Name: "alice personal", OwnerID: testUserID, Plan: "free", MaxMembers: 5},
		{ID: wsSharedWithUser, Name: "bob workspace", OwnerID: otherOwnerUserID, Plan: "free", MaxMembers: 5},
	}
	for i := range workspaces {
		if err := database.Create(&workspaces[i]).Error; err != nil {
			t.Fatalf("seed workspace: %v", err)
		}
	}

	members := []models.WorkspaceMember{
		{WorkspaceID: wsPersonal, UserID: testUserID, Role: RoleAdmin},
		{WorkspaceID: wsSharedWithUser, UserID: otherOwnerUserID, Role: RoleAdmin},
		{WorkspaceID: wsSharedWithUser, UserID: testUserID, Role: RoleViewer},
	}
	for i := range members {
		if err := database.Create(&members[i]).Error; err != nil {
			t.Fatalf("seed member: %v", err)
		}
	}
}

// newTestRoute 组装一条带登录态（userID=1）的测试路由：注入 userID 后执行待测中间件，
// 最后一个 handler 返回 200，用于断言门控是否放行。
func newTestRoute(handlerFuncs ...gin.HandlerFunc) *gin.Engine {
	chain := make([]gin.HandlerFunc, 0, len(handlerFuncs)+2)
	chain = append(chain, func(c *gin.Context) { c.Set("userID", uint(testUserID)) })
	chain = append(chain, handlerFuncs...)
	chain = append(chain, func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })

	r := gin.New()
	r.GET("/probe", chain...)
	return r
}

func doProbe(r *gin.Engine, workspaceHeader string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/probe", nil)
	if workspaceHeader != "" {
		req.Header.Set("X-Workspace-ID", workspaceHeader)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestWorkspaceMiddlewareFallsBackToPersonalWorkspace(t *testing.T) {
	setupWorkspaceTestDB(t)

	rec := doProbe(newTestRoute(WorkspaceMiddleware(), func(c *gin.Context) {
		id, ok := CurrentWorkspaceID(c)
		if !ok {
			t.Fatal("CurrentWorkspaceID() = false, want personal workspace id")
		}
		if id != wsPersonal {
			t.Fatalf("CurrentWorkspaceID() = %d, want %d", id, wsPersonal)
		}
	}), "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 body=%s", rec.Code, rec.Body.String())
	}
}

func TestWorkspaceMiddlewareUsesExplicitHeader(t *testing.T) {
	setupWorkspaceTestDB(t)

	rec := doProbe(newTestRoute(WorkspaceMiddleware(), func(c *gin.Context) {
		id, _ := CurrentWorkspaceID(c)
		if id != wsSharedWithUser {
			t.Fatalf("CurrentWorkspaceID() = %d, want %d", id, wsSharedWithUser)
		}
	}), fmt.Sprint(wsSharedWithUser))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
}

func TestRBACMiddlewareWorksWithoutWorkspaceHeader(t *testing.T) {
	setupWorkspaceTestDB(t)

	// 未携带 X-Workspace-ID 时回退到个人 Workspace，免费功能仍应可用
	rec := doProbe(newTestRoute(WorkspaceMiddleware(), RBACMiddleware(RoleAdmin, RoleOperator, RoleViewer)), "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}

	// viewer 在其他人的 Workspace 中不能执行 admin 操作
	rec = doProbe(newTestRoute(WorkspaceMiddleware(), RBACMiddleware(RoleAdmin)), fmt.Sprint(wsSharedWithUser))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("viewer as admin: status = %d, want 403", rec.Code)
	}
}
