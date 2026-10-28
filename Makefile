# webSSH 社区版构建
# 单版本仓库：后端 go build，前端 vite build

.PHONY: all build backend frontend release release-linux release-windows test lint clean help

BUILD_DIR := output
DIST_DIR := $(BUILD_DIR)/dist
VERSION := $(shell sed -n 's/.*var Version = "\([^"]*\)".*/\1/p' backend/version.go)
VOLTA := $(shell command -v volta 2>/dev/null)

ifeq ($(VOLTA),)
$(error "volta not found. Please install volta.")
endif

all: build

build: backend frontend

backend:
	@echo "=== Building backend ==="
	@mkdir -p $(BUILD_DIR)
	cd backend && go build -o ../$(BUILD_DIR)/webssh-backend .
	@echo "Backend -> $(BUILD_DIR)/webssh-backend"

frontend:
	@echo "=== Building frontend ==="
	@volta run npm run build
	@mkdir -p $(BUILD_DIR)/frontend
	@cp -r dist/* $(BUILD_DIR)/frontend/
	@echo "Frontend -> $(BUILD_DIR)/frontend"

release: release-linux release-windows

release-linux: frontend-dist
	@mkdir -p $(DIST_DIR)/webssh-$(VERSION)-linux-amd64
	cd backend && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w -X main.Version=$(VERSION)" -o ../$(DIST_DIR)/webssh-$(VERSION)-linux-amd64/webssh-backend .
	@cp -r $(BUILD_DIR)/frontend $(DIST_DIR)/webssh-$(VERSION)-linux-amd64/
	@tar -czf $(DIST_DIR)/webssh-$(VERSION)-linux-amd64.tar.gz -C $(DIST_DIR) webssh-$(VERSION)-linux-amd64
	@echo "Release -> $(DIST_DIR)/webssh-$(VERSION)-linux-amd64.tar.gz"

release-windows: frontend-dist
	@mkdir -p $(DIST_DIR)/webssh-$(VERSION)-windows-amd64
	cd backend && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -X main.Version=$(VERSION)" -o ../$(DIST_DIR)/webssh-$(VERSION)-windows-amd64/webssh-backend.exe .
	@cp -r $(BUILD_DIR)/frontend $(DIST_DIR)/webssh-$(VERSION)-windows-amd64/
	@tar -czf $(DIST_DIR)/webssh-$(VERSION)-windows-amd64.tar.gz -C $(DIST_DIR) webssh-$(VERSION)-windows-amd64
	@echo "Release -> $(DIST_DIR)/webssh-$(VERSION)-windows-amd64.tar.gz"

frontend-dist:
	@volta run npm run build
	@rm -rf $(BUILD_DIR)/frontend
	@mkdir -p $(BUILD_DIR)/frontend
	@cp -r dist/* $(BUILD_DIR)/frontend/

test:
	cd backend && go test ./...

lint:
	volta run npm run lint

clean:
	@rm -rf $(BUILD_DIR)
	@echo "Cleaned $(BUILD_DIR)"

help:
	@echo "Available targets:"
	@echo "  make build        - Build backend and frontend into $(BUILD_DIR)/"
	@echo "  make backend      - Build the Go backend only"
	@echo "  make frontend     - Build the React frontend only"
	@echo "  make release      - Build versioned linux/windows packages into $(DIST_DIR)/"
	@echo "  make test         - Run backend Go tests"
	@echo "  make lint         - Run oxlint on frontend"
	@echo "  make clean        - Remove build artifacts"
