#!/bin/bash

# 后端服务启动脚本
LOG_FILE="/var/log/webssh.log"

echo "===================================" >> "$LOG_FILE"
echo "[$(date)] 启动后端服务" >> "$LOG_FILE"
echo "===================================" >> "$LOG_FILE"

# 打印环境信息
echo "[$(date)] 当前用户: $(whoami)" >> "$LOG_FILE"
echo "[$(date)] 当前目录: $(pwd)" >> "$LOG_FILE"
echo "[$(date)] PATH: $PATH" >> "$LOG_FILE"
echo "[$(date)] 环境变量 PORT: $PORT" >> "$LOG_FILE"

# 检查是否存在 .env 文件
if [ ! -f .env ]; then
    echo "[$(date)] ⚠️  未找到 .env 文件，请在项目根目录创建 .env 文件并修改配置后重新运行..." >> "$LOG_FILE"
    echo "[$(date)] 当前目录内容:" >> "$LOG_FILE"
    ls -la >> "$LOG_FILE"
    exit 1
fi

echo "[$(date)] ✅ 找到 .env 文件" >> "$LOG_FILE"

# 检查 webssh-backend 二进制文件
if [ ! -f ./webssh-backend ]; then
    echo "[$(date)] ❌ 未找到 webssh-backend 二进制文件" >> "$LOG_FILE"
    echo "[$(date)] 当前目录内容:" >> "$LOG_FILE"
    ls -la >> "$LOG_FILE"
    exit 1
fi

echo "[$(date)] ✅ 找到 webssh-backend 二进制文件" >> "$LOG_FILE"
echo "[$(date)] 🚀 启动服务..." >> "$LOG_FILE"

# 加载环境变量并启动服务
export $(cat .env | grep -v '^#' | xargs)
echo "[$(date)] ✅ 环境变量加载完成" >> "$LOG_FILE"

# 启动服务并记录输出
./webssh-backend >> "$LOG_FILE" 2>&1
echo "[$(date)] ❌ 服务意外退出，退出码: $?" >> "$LOG_FILE"
