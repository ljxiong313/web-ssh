package handlers

import (
	"bytes"
	"fmt"
	"mime/multipart"
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

const handlerTestUserID = uint(11)

func setupHandlerTestDB(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	dsn := fmt.Sprintf("file:hscope_%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	database, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	if err := database.AutoMigrate(&models.User{}, &models.Workspace{}, &models.WorkspaceMember{}, &models.Connection{}, &models.Folder{}); err != nil {
		t.Fatalf("migrate test db: %v", err)
	}
	config.DB = database
	originalMVP := config.MVPMode
	config.MVPMode = false
	t.Cleanup(func() { config.MVPMode = originalMVP })
}

// runImport 以“当前 Workspace = workspaceID”的请求作用域调用导入接口。
func runImport(t *testing.T, workspaceID uint, payload string) *httptest.ResponseRecorder {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "connections.json")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte(payload)); err != nil {
		t.Fatalf("write payload: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	r := gin.New()
	r.POST("/api/connections/import", func(c *gin.Context) {
		c.Set("userID", handlerTestUserID)
		if workspaceID != 0 {
			c.Set("workspaceID", workspaceID)
		}
	}, ImportConnections)

	req := httptest.NewRequest(http.MethodPost, "/api/connections/import", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestImportConnectionsAssignsCurrentWorkspace(t *testing.T) {
	setupHandlerTestDB(t)

	// 缺陷 D8：导入的连接过去不写 workspace_id，导入后在任何 Workspace 下都不可见
	rec := runImport(t, 7, `[{"name":"imp1","host":"10.0.0.1","username":"root"}]`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}

	var connections []models.Connection
	if err := config.DB.Where("user_id = ?", handlerTestUserID).Find(&connections).Error; err != nil {
		t.Fatalf("query connections: %v", err)
	}
	if len(connections) != 1 {
		t.Fatalf("imported %d connections, want 1", len(connections))
	}
	if connections[0].WorkspaceID == nil || *connections[0].WorkspaceID != 7 {
		t.Fatalf("imported connection workspace_id = %v, want 7", connections[0].WorkspaceID)
	}
}

func TestImportConnectionsDropsForeignFolder(t *testing.T) {
	setupHandlerTestDB(t)

	folder := models.Folder{ID: 3, UserID: handlerTestUserID, Name: "other-ws", WorkspaceID: ptrUint(99)}
	if err := config.DB.Create(&folder).Error; err != nil {
		t.Fatalf("seed folder: %v", err)
	}

	rec := runImport(t, 7, `[{"name":"imp1","host":"10.0.0.1","username":"root","folder_id":3}]`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}

	var connection models.Connection
	if err := config.DB.Where("user_id = ? AND name = ?", handlerTestUserID, "imp1").First(&connection).Error; err != nil {
		t.Fatalf("load connection: %v", err)
	}
	if connection.FolderID != nil {
		t.Fatalf("folder_id = %d, want it cleared because the folder belongs to workspace %d", *connection.FolderID, 99)
	}
}

func TestImportConnectionsKeepsFolderInSameWorkspace(t *testing.T) {
	setupHandlerTestDB(t)

	folder := models.Folder{ID: 4, UserID: handlerTestUserID, Name: "same-ws", WorkspaceID: ptrUint(7)}
	if err := config.DB.Create(&folder).Error; err != nil {
		t.Fatalf("seed folder: %v", err)
	}

	if rec := runImport(t, 7, `[{"name":"imp1","host":"10.0.0.1","username":"root","folder_id":4}]`); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}

	var connection models.Connection
	if err := config.DB.Where("user_id = ? AND name = ?", handlerTestUserID, "imp1").First(&connection).Error; err != nil {
		t.Fatalf("load connection: %v", err)
	}
	if connection.FolderID == nil || *connection.FolderID != 4 {
		t.Fatalf("folder_id = %v, want 4", connection.FolderID)
	}
}

func TestCurrentWorkspaceIDPrefersContextOverHeader(t *testing.T) {
	setupHandlerTestDB(t)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Request.Header.Set("X-Workspace-ID", "5")
	c.Set("workspaceID", uint(7))

	id := currentWorkspaceID(c)
	if id == nil || *id != 7 {
		t.Fatalf("currentWorkspaceID() = %v, want 7 (context wins over header)", id)
	}

	// 未经过 WorkspaceMiddleware 的路由仍按请求头解析
	c2, _ := gin.CreateTestContext(httptest.NewRecorder())
	c2.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c2.Request.Header.Set("X-Workspace-ID", "5")
	id = currentWorkspaceID(c2)
	if id == nil || *id != 5 {
		t.Fatalf("currentWorkspaceID() = %v, want 5 (header fallback)", id)
	}

	if sameWorkspaceScope(ptrUint(1), ptrUint(2)) {
		t.Error("sameWorkspaceScope(1, 2) = true, want false")
	}
	if !sameWorkspaceScope(nil, nil) {
		t.Error("sameWorkspaceScope(nil, nil) = false, want true")
	}
	if sameWorkspaceScope(ptrUint(1), nil) {
		t.Error("sameWorkspaceScope(1, nil) = true, want false")
	}
}

func ptrUint(v uint) *uint { return &v }
