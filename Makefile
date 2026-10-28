# webSSH 社区版构建
# 单版本仓库：后端 go build，前端 vite build

.PHONY: all build backend frontend test lint clean help

BUILD_DIR := output
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
	@echo "  make test         - Run backend Go tests"
	@echo "  make lint         - Run oxlint on frontend"
	@echo "  make clean        - Remove build artifacts"
