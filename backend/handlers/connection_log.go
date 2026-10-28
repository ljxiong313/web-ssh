package handlers

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"webssh-backend/middleware"
	"webssh-backend/repositories"
)

func GetConnectionLogs(c *gin.Context) {
	userID := middleware.GetUserID(c)

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	startTime := c.Query("start_time")
	endTime := c.Query("end_time")

	logs, err := repositories.GetConnectionLogs(userID, limit, offset, startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, logs)
}

func ExportConnectionLogsCSV(c *gin.Context) {
	userID := middleware.GetUserID(c)
	startTime := c.Query("start_time")
	endTime := c.Query("end_time")

	logs, err := repositories.GetConnectionLogs(userID, 100000, 0, startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=connection-logs-"+time.Now().Format("20060102150405")+".csv")

	writer := csv.NewWriter(c.Writer)
	defer writer.Flush()

	header := []string{"时间", "连接名", "主机", "用户名", "状态", "时长", "错误信息"}
	if err := writer.Write(header); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for _, log := range logs {
		durationStr := "-"
		if log.Duration > 0 {
			durationStr = strconv.Itoa(int(log.Duration)) + "秒"
		}
		statusStr := "失败"
		if log.Status == "success" {
			statusStr = "成功"
		}
		errMsg := log.ErrMsg
		if errMsg == "" {
			errMsg = "-"
		}
		record := []string{
			log.ConnectedAt.Format("2006-01-02 15:04:05"),
			log.ConnName,
			log.Host,
			log.Username,
			statusStr,
			durationStr,
			errMsg,
		}
		if err := writer.Write(record); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
}

func DeleteConnectionLogs(c *gin.Context) {
	userID := middleware.GetUserID(c)

	if err := repositories.DeleteConnectionLogsByUserID(userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Connection logs cleared"})
}
