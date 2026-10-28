package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/pkg/sftp"
	"webssh-backend/config"
	"webssh-backend/middleware"
	"webssh-backend/models"
	"webssh-backend/repositories"
	"webssh-backend/services"
	"webssh-backend/utils"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		return config.IsAllowedOrigin(origin)
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

type TerminalMessage struct {
	Type string `json:"type"`
	Data string `json:"data"`
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
}

// safeConn wraps websocket.Conn with a mutex to protect concurrent writes.
// gorilla/websocket does not support concurrent writes to the same connection.
type safeConn struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (s *safeConn) WriteJSON(v interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.conn.WriteJSON(v)
}

func (s *safeConn) WriteMessage(messageType int, data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.conn.WriteMessage(messageType, data)
}

func (s *safeConn) ReadJSON(v interface{}) error {
	return s.conn.ReadJSON(v)
}

func (s *safeConn) Close() error {
	return s.conn.Close()
}

func (s *safeConn) SetReadDeadline(t time.Time) error {
	return s.conn.SetReadDeadline(t)
}

type RecordingSession struct {
	File        *os.File
	StartTime   time.Time
	Events      []models.TerminalRecordingEvent
	RecordingID uint
	Mutex       sync.Mutex
}

var activeRecordings = make(map[string]*RecordingSession)
var recordingsMutex sync.Mutex

func getRecordingFilePath(recordingID uint) string {
	dataDir := "./data/recordings"
	os.MkdirAll(dataDir, 0755)
	return filepath.Join(dataDir, fmt.Sprintf("recording_%d.cast", recordingID))
}

func saveRecording(rec *RecordingSession, recording *models.TerminalRecording, termCols, termRows int) error {
	header := map[string]interface{}{
		"version":   2,
		"width":     termCols,
		"height":    termRows,
		"timestamp": recording.StartedAt.Unix(),
		"env": map[string]string{
			"SHELL": "/bin/bash",
			"TERM":  "xterm-256color",
		},
	}
	headerJSON, _ := json.Marshal(header)
	rec.File.Write(headerJSON)
	rec.File.WriteString("\n")

	rec.Mutex.Lock()
	events := make([]models.TerminalRecordingEvent, len(rec.Events))
	copy(events, rec.Events)
	rec.Mutex.Unlock()

	for _, event := range events {
		line, _ := json.Marshal([]interface{}{event.Time, event.Type, event.Data})
		rec.File.Write(line)
		rec.File.WriteString("\n")
	}

	return rec.File.Close()
}

func startRecording(userID uint, connectionID uint, connName string, workspaceID uint) (*RecordingSession, error) {
	recording := models.TerminalRecording{
		UserID:       userID,
		ConnectionID: connectionID,
		ConnName:     connName,
		WorkspaceID:  workspaceID,
		Status:       "recording",
		StartedAt:    time.Now(),
	}
	if err := repositories.CreateRecording(&recording); err != nil {
		return nil, err
	}

	filePath := getRecordingFilePath(recording.ID)
	file, err := os.Create(filePath)
	if err != nil {
		repositories.UpdateRecordingStatus(recording.ID, "failed")
		return nil, err
	}

	rec := &RecordingSession{
		File:        file,
		StartTime:   recording.StartedAt,
		RecordingID: recording.ID,
	}

	recordingsMutex.Lock()
	activeRecordings[fmt.Sprintf("%d-%d", userID, connectionID)] = rec
	recordingsMutex.Unlock()

	return rec, nil
}

func stopRecording(userID uint, connectionID uint, termCols, termRows int) (*models.TerminalRecording, error) {
	key := fmt.Sprintf("%d-%d", userID, connectionID)
	recordingsMutex.Lock()
	rec, exists := activeRecordings[key]
	if !exists {
		recordingsMutex.Unlock()
		return nil, fmt.Errorf("no active recording")
	}
	delete(activeRecordings, key)
	recordingsMutex.Unlock()

	recording, err := repositories.GetRecordingByID(rec.RecordingID)
	if err != nil {
		return nil, err
	}

	endedAt := time.Now()
	duration := int(endedAt.Sub(rec.StartTime).Seconds())

	if err := saveRecording(rec, &recording, termCols, termRows); err != nil {
		repositories.UpdateRecording(&recording, map[string]interface{}{
			"status":   "failed",
			"ended_at": endedAt,
		})
		return nil, err
	}

	fileInfo, _ := os.Stat(getRecordingFilePath(recording.ID))
	var size int64
	if fileInfo != nil {
		size = fileInfo.Size()
	}

	repositories.UpdateRecording(&recording, map[string]interface{}{
		"status":   "completed",
		"duration": duration,
		"size":     size,
		"ended_at": endedAt,
	})

	recording.Duration = duration
	recording.Size = size
	recording.Status = "completed"
	recording.EndedAt = &endedAt

	return &recording, nil
}

func recordEvent(rec *RecordingSession, data string, eventType string) {
	if rec == nil {
		return
	}
	rec.Mutex.Lock()
	defer rec.Mutex.Unlock()
	event := models.TerminalRecordingEvent{
		Time: time.Since(rec.StartTime).Seconds(),
		Type: eventType,
		Data: data,
	}
	rec.Events = append(rec.Events, event)
}

func stripANSI(input string) string {
	ansiRegex := regexp.MustCompile("\x1b\\[[0-9;]*[a-zA-Z]")
	return ansiRegex.ReplaceAllString(input, "")
}

func parseCommand(input string) string {
	cleaned := stripANSI(input)
	var cmd strings.Builder
	for _, r := range cleaned {
		if unicode.IsPrint(r) || r == ' ' || r == '\t' {
			cmd.WriteRune(r)
		}
	}
	return strings.TrimSpace(cmd.String())
}

func checkSensitiveCommand(workspaceID uint, command string) (*models.SensitiveCommandRule, string) {
	if workspaceID == 0 || command == "" {
		return nil, "allow"
	}
	rules, _ := repositories.GetSensitiveCommandRulesByWorkspace(workspaceID)
	for _, rule := range rules {
		matched := false
		if rule.MatchType == "regex" {
			re, err := regexp.Compile(rule.Pattern)
			if err == nil {
				matched = re.MatchString(command)
			}
		} else {
			matched = strings.Contains(command, rule.Pattern)
		}
		if matched {
			return &rule, rule.Action
		}
	}
	return nil, "allow"
}

func logCommandAudit(userID uint, username string, connectionID uint, connName string, workspaceID uint, command string, action string, ruleID *uint, ruleName string, blocked bool, ipAddress string, sessionID string) {
	repositories.CreateCommandAuditLog(&models.CommandAuditLog{
		UserID:       userID,
		Username:     username,
		ConnectionID: connectionID,
		ConnName:     connName,
		WorkspaceID:  workspaceID,
		Command:      command,
		Action:       action,
		RuleID:       ruleID,
		RuleName:     ruleName,
		Blocked:      blocked,
		IPAddress:    ipAddress,
		SessionID:    sessionID,
	})
}

func HandleTerminal(c *gin.Context) {
	connID, err := strconv.ParseUint(c.Param("connId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid connection ID"})
		return
	}

	userID := middleware.GetUserID(c)

	connection, err := repositories.GetConnectionByIDAndUserID(uint(connID), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	password, err := utils.Decrypt(connection.Password, config.EncryptionKey)
	if err != nil {
		password = connection.Password
	}
	privateKey, err := utils.Decrypt(connection.PrivateKey, config.EncryptionKey)
	if err != nil {
		privateKey = connection.PrivateKey
	}

	rawWS, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	ws := &safeConn{conn: rawWS}
	defer ws.Close()

	connInfo := &services.ConnectionInfo{
		Host:       connection.Host,
		Port:       connection.Port,
		Username:   connection.Username,
		AuthType:   connection.AuthType,
		Password:   password,
		PrivateKey: privateKey,
	}

	sshClient, err := services.NewSSHClient(connInfo)
	if err != nil {
		errStr := err.Error()
		if isAuthError(errStr) && connection.AuthType != "key" {
			const maxAttempts = 5
			attempts := 0
		authLoop:
			for {
				// 发送密码验证请求
				ws.WriteJSON(TerminalMessage{Type: "auth_required", Data: "需要密码进行身份验证"})

				var msg TerminalMessage
				if err := ws.ReadJSON(&msg); err != nil {
					return
				}

				switch msg.Type {
				case "cancel":
					// 用户取消，发送重试提示保持连接
					ws.WriteJSON(TerminalMessage{Type: "auth_retry", Data: "密码错误，按回车重试"})
					// 等待用户按回车或再次取消
					for {
						var retryMsg TerminalMessage
						if err := ws.ReadJSON(&retryMsg); err != nil {
							return
						}
						if retryMsg.Type == "cancel" {
							return
						}
						if retryMsg.Type == "retry_auth" {
							attempts = 0
							continue authLoop
						}
					}
				case "retry_auth":
					// 用户按回车重试，重置计数器
					attempts = 0
					continue
				case "auth_password":
					attempts++
					connInfo.Password = msg.Data
					sshClient, err = services.NewSSHClient(connInfo)
					if err == nil {
						// 密码正确，保存加密密码
						if msg.Data != "" {
							encrypted, _ := utils.Encrypt(msg.Data, config.EncryptionKey)
							if encrypted != "" {
								repositories.UpdateConnectionPassword(connection.ID, encrypted)
							}
						}
						break authLoop // 跳出外层 for 循环
					}

					// 密码错误
					if attempts >= maxAttempts {
						// 达到最大尝试次数，发送重试提示
						repositories.CreateConnectionLog(&models.ConnectionLog{
							UserID:      userID,
							ConnName:    connection.Name,
							Host:        connection.Host,
							Username:    connection.Username,
							ConnectedAt: time.Now(),
							Status:      "failed",
							ErrMsg:      fmt.Sprintf("密码验证失败，已尝试 %d 次: %s", maxAttempts, err.Error()),
						})
						ws.WriteJSON(TerminalMessage{Type: "auth_retry", Data: fmt.Sprintf("密码错误，按回车重试")})
						// 等待用户按回车或取消
						for {
							var retryMsg TerminalMessage
							if err := ws.ReadJSON(&retryMsg); err != nil {
								return
							}
							if retryMsg.Type == "cancel" {
								return
							}
							if retryMsg.Type == "retry_auth" {
								attempts = 0
								continue authLoop
							}
						}
					}
					// 未达到最大次数，继续循环
				default:
					ws.WriteJSON(TerminalMessage{Type: "error", Data: "Expected auth_password message"})
					return
				}
			}
		} else {
			repositories.CreateConnectionLog(&models.ConnectionLog{
				UserID:      userID,
				ConnName:    connection.Name,
				Host:        connection.Host,
				Username:    connection.Username,
				ConnectedAt: time.Now(),
				Status:      "failed",
				ErrMsg:      err.Error(),
			})
			ws.WriteJSON(TerminalMessage{Type: "error", Data: err.Error()})
			return
		}
	}
	defer sshClient.Close()

	ws.WriteJSON(TerminalMessage{Type: "connected", Data: "SSH connection established"})

	ws.SetReadDeadline(time.Now().Add(5 * time.Second))
	var initMsg TerminalMessage
	if err := ws.ReadJSON(&initMsg); err == nil && initMsg.Type == "resize" && initMsg.Cols > 0 && initMsg.Rows > 0 {
		sshClient.Resize(initMsg.Cols, initMsg.Rows)
	}
	ws.SetReadDeadline(time.Time{})

	if err := sshClient.StartShell(); err != nil {
		ws.WriteJSON(TerminalMessage{Type: "error", Data: err.Error()})
		return
	}

	connectedAt := time.Now()
	log := models.ConnectionLog{
		UserID:      userID,
		ConnName:    connection.Name,
		Host:        connection.Host,
		Username:    connection.Username,
		ConnectedAt: connectedAt,
		Status:      "success",
	}
	repositories.CreateConnectionLog(&log)
	defer func() {
		disconnectAt := time.Now()
		duration := int64(disconnectAt.Sub(connectedAt).Seconds())
		repositories.UpdateConnectionLog(&log, map[string]interface{}{
			"disconnect_at": disconnectAt,
			"duration":      duration,
		})
	}()

	var recording *RecordingSession
	var termCols, termRows int

	workspaceIDVal, _ := c.Get("workspaceID")
	var workspaceID uint
	if wid, ok := workspaceIDVal.(uint); ok {
		workspaceID = wid
	}

	user, _ := repositories.GetUserByID(userID)

	sessionID := fmt.Sprintf("%d-%d-%d", userID, connID, time.Now().Unix())

	var cmdBuffer strings.Builder
	var cmdMutex sync.Mutex

	// Hidden command capture: write to interactive session stdin, capture stdout
	var captureOutput bool
	var captureMu sync.Mutex
	var captureBuf strings.Builder
	captureDone := make(chan struct{})

	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := sshClient.Read(buf)
			if err != nil {
				ws.WriteJSON(TerminalMessage{Type: "disconnect", Data: "Connection closed"})
				return
			}
			if n > 0 {
				data := string(buf[:n])
				captureMu.Lock()
				if captureOutput {
					// In capture mode: append to buffer, don't send to terminal
					captureBuf.WriteString(data)
					captureMu.Unlock()
				} else {
					captureMu.Unlock()
					ws.WriteJSON(TerminalMessage{Type: "data", Data: data})
					if recording != nil {
						recordEvent(recording, data, "o")
					}
				}
			}
		}
	}()

	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := sshClient.ReadErr(buf)
			if err != nil {
				return
			}
			if n > 0 {
				data := string(buf[:n])
				ws.WriteJSON(TerminalMessage{Type: "stderr", Data: data})
				if recording != nil {
					recordEvent(recording, data, "o")
				}
			}
		}
	}()

	go func() {
		ticker := time.NewTicker(1500 * time.Millisecond)
		defer ticker.Stop()
		var prevNetRx, prevNetTx, prevIORx, prevIOTx uint64
		var prevTime time.Time
		var prevCPUTotal, prevCPUIdle uint64
		for {
			select {
			case <-ticker.C:
				if !sshClient.IsConnected() {
					return
				}
				stats := getServerStats(sshClient, &prevNetRx, &prevNetTx, &prevIORx, &prevIOTx, &prevTime, &prevCPUTotal, &prevCPUIdle)
				if stats != "" {
					ws.WriteJSON(TerminalMessage{Type: "stats", Data: stats})
				}
			}
		}
	}()

	for {
		var msg TerminalMessage
		if err := ws.ReadJSON(&msg); err != nil {
			break
		}

		switch msg.Type {
		case "data":
			if recording != nil {
				recordEvent(recording, msg.Data, "i")
			}

			cmdMutex.Lock()
			for _, b := range msg.Data {
				if b == '\r' || b == '\n' {
					cmdStr := parseCommand(cmdBuffer.String())
					cmdBuffer.Reset()
					cmdMutex.Unlock()

					if cmdStr != "" {
						rule, action := checkSensitiveCommand(workspaceID, cmdStr)

						// 记录命令历史
						var wsID *uint
						if workspaceID > 0 {
							wsID = &workspaceID
						}
						repositories.CreateCommandHistory(&models.CommandHistory{
							UserID:       userID,
							WorkspaceID:  wsID,
							ConnectionID: uint(connID),
							Command:      cmdStr,
							SessionID:    sessionID,
						})

						if rule != nil {
							var ruleID *uint
							if rule.ID > 0 {
								ruleID = &rule.ID
							}
							if action == "block" {
								logCommandAudit(userID, user.Username, uint(connID), connection.Name, workspaceID, cmdStr, "block", ruleID, rule.Name, true, c.ClientIP(), sessionID)
								ws.WriteJSON(TerminalMessage{Type: "warning", Data: fmt.Sprintf("[安全警告] 命令被拦截: %s (规则: %s)", cmdStr, rule.Name)})
								continue
							}
							if action == "warn" {
								logCommandAudit(userID, user.Username, uint(connID), connection.Name, workspaceID, cmdStr, "warn", ruleID, rule.Name, false, c.ClientIP(), sessionID)
								ws.WriteJSON(TerminalMessage{Type: "warning", Data: fmt.Sprintf("[安全提示] 检测到敏感命令: %s (规则: %s)", cmdStr, rule.Name)})
							} else {
								logCommandAudit(userID, user.Username, uint(connID), connection.Name, workspaceID, cmdStr, "audit", ruleID, rule.Name, false, c.ClientIP(), sessionID)
							}
						} else {
							logCommandAudit(userID, user.Username, uint(connID), connection.Name, workspaceID, cmdStr, "allow", nil, "", false, c.ClientIP(), sessionID)
						}
					}

					cmdMutex.Lock()
				} else {
					cmdBuffer.WriteByte(byte(b))
				}
			}
			cmdMutex.Unlock()

			// Check if this is a hidden command (starts with space and ends with newline)
			// Single space key press should be sent to terminal, not treated as hidden command
			if strings.HasPrefix(msg.Data, " ") && strings.HasSuffix(msg.Data, "\n") {
				// Execute hidden command in the interactive session, capture output
				go func(cmd string) {
					captureMu.Lock()
					captureOutput = true
					captureBuf.Reset()
					captureMu.Unlock()

					// Small delay to ensure capture flag is set before writing
					time.Sleep(50 * time.Millisecond)

					// Write command to interactive session stdin
					sshClient.Write([]byte(cmd + "\n"))

					// Wait for output to arrive, then parse
					select {
					case <-captureDone:
					case <-time.After(200 * time.Millisecond):
					}

					captureMu.Lock()
					captureOutput = false
					output := captureBuf.String()
					captureMu.Unlock()

					// Parse captured output to find pwd result (line starting with /)
					// Strip ANSI escape sequences before parsing
					// Also handle private mode sequences like \x1b[?2004l
					ansiRegexp := regexp.MustCompile(`\x1b\[[?0-9;]*[a-zA-Z]`)
					cleanOutput := ansiRegexp.ReplaceAllString(output, "")
					// Split by both \n and \r to handle terminal output properly
					for _, line := range regexp.MustCompile(`[\r\n]+`).Split(cleanOutput, -1) {
						line = strings.TrimSpace(line)
						// pwd output is a clean absolute path: starts with / and contains no spaces or special chars
						if strings.HasPrefix(line, "/") && len(line) > 1 && !strings.ContainsAny(line, " $@#") {
							ws.WriteJSON(TerminalMessage{Type: "hidden_output", Data: line})
							return
						}
					}
				}(strings.TrimSpace(strings.TrimPrefix(msg.Data, " ")))
			} else {
				sshClient.Write([]byte(msg.Data))
			}
		case "resize":
			termCols = msg.Cols
			termRows = msg.Rows
			sshClient.Resize(msg.Cols, msg.Rows)
		case "start_recording":
			if recording != nil {
				ws.WriteJSON(TerminalMessage{Type: "recording", Data: "already_recording"})
				continue
			}
			workspaceIDVal, _ := c.Get("workspaceID")
			var recWorkspaceID uint
			if wid, ok := workspaceIDVal.(uint); ok {
				recWorkspaceID = wid
			}
			rec, err := startRecording(userID, uint(connID), connection.Name, recWorkspaceID)
			if err != nil {
				ws.WriteJSON(TerminalMessage{Type: "recording", Data: "start_failed"})
				continue
			}
			recording = rec
			ws.WriteJSON(TerminalMessage{Type: "recording", Data: "started"})
		case "stop_recording":
			if recording == nil {
				ws.WriteJSON(TerminalMessage{Type: "recording", Data: "not_recording"})
				continue
			}
			if termCols == 0 {
				termCols = 80
			}
			if termRows == 0 {
				termRows = 24
			}
			recResult, err := stopRecording(userID, uint(connID), termCols, termRows)
			if err != nil {
				ws.WriteJSON(TerminalMessage{Type: "recording", Data: "stop_failed"})
				continue
			}
			recording = nil
			ws.WriteJSON(TerminalMessage{Type: "recording", Data: "stopped", Cols: int(recResult.ID)})
		case "ping":
			ws.WriteJSON(TerminalMessage{Type: "pong"})
		}
	}

	if recording != nil {
		if termCols == 0 {
			termCols = 80
		}
		if termRows == 0 {
			termRows = 24
		}
		stopRecording(userID, uint(connID), termCols, termRows)
	}
}

type ServerStats struct {
	CPU    string `json:"cpu"`
	Memory string `json:"memory"`
	Disk   string `json:"disk"`
	NetRx  string `json:"net_rx"`
	NetTx  string `json:"net_tx"`
	IORx   string `json:"io_rx"`
	IOTx   string `json:"io_tx"`
}

func getServerStats(sshClient *services.SSHClient, prevNetRx, prevNetTx, prevIORx, prevIOTx *uint64, prevTime *time.Time, prevCPUTotal, prevCPUIdle *uint64) string {
	if !sshClient.IsConnected() {
		return ""
	}

	// CPU 使用率需要两次采样计算差值
	cpuOut, _ := sshClient.ExecuteCommand(`awk '/^cpu /{u=$2;n=$3;s=$4;i=$5;io=$6;irq=$7;soft=$8;steal=$9; t=u+n+s+i+io+irq+soft+steal; print t, i}' /proc/stat`)
	cpu := "0.0"
	cpuOut = strings.TrimSpace(cpuOut)
	if cpuOut != "" {
		parts := strings.Fields(cpuOut)
		if len(parts) >= 2 {
			currTotal, _ := strconv.ParseUint(parts[0], 10, 64)
			currIdle, _ := strconv.ParseUint(parts[1], 10, 64)
			if *prevCPUTotal > 0 {
				totalDiff := currTotal - *prevCPUTotal
				idleDiff := currIdle - *prevCPUIdle
				if totalDiff > 0 {
					usage := (1.0 - float64(idleDiff)/float64(totalDiff)) * 100
					if usage < 0 {
						usage = 0
					}
					if usage > 100 {
						usage = 100
					}
					cpu = fmt.Sprintf("%.1f", usage)
				}
			}
			*prevCPUTotal = currTotal
			*prevCPUIdle = currIdle
		}
	}

	memOut, _ := sshClient.ExecuteCommand(`free | awk 'NR==2{printf "%.1f", $3*100/$2}'`)
	mem := strings.TrimSpace(memOut)
	if mem == "" {
		mem = "0.0"
	}

	diskOut, _ := sshClient.ExecuteCommand(`df -h / | awk 'NR==2{print $5}'`)
	disk := strings.TrimSpace(diskOut)

	now := time.Now()

	netIfaceOut, _ := sshClient.ExecuteCommand(`cat /proc/net/dev | awk -F: 'NR>2 && ($2+0>0 || $1 ~ /eth|ens|enp|wlan|wlp/){gsub(/^[ \t]+/,"",$1); print $1; exit}'`)
	netIface := strings.TrimSpace(netIfaceOut)
	if netIface == "" {
		netIface = "eth0"
	}
	netOut, _ := sshClient.ExecuteCommand(fmt.Sprintf(`cat /proc/net/dev | grep '%s' | awk '{print $2, $10}'`, netIface))
	netParts := strings.Fields(strings.TrimSpace(netOut))
	netRxStr, netTxStr := "0", "0"
	var currNetRx, currNetTx uint64
	if len(netParts) >= 2 {
		currNetRx, _ = strconv.ParseUint(netParts[0], 10, 64)
		currNetTx, _ = strconv.ParseUint(netParts[1], 10, 64)
		if !prevTime.IsZero() {
			elapsed := now.Sub(*prevTime).Seconds()
			if elapsed > 0 {
				netRxStr = formatBytesPerSec(uint64(float64(currNetRx-*prevNetRx) / elapsed))
				netTxStr = formatBytesPerSec(uint64(float64(currNetTx-*prevNetTx) / elapsed))
			}
		}
		*prevNetRx = currNetRx
		*prevNetTx = currNetTx
	}

	diskDevOut, _ := sshClient.ExecuteCommand(`cat /proc/diskstats | awk '($3 ~ /^[shv]d[a-z]$/ || $3 ~ /^nvme[0-9]+n[0-9]+$/ || $3 ~ /^mmcblk[0-9]+$/ || $3 ~ /^xvd[a-z]$/){print $3; exit}'`)
	diskDev := strings.TrimSpace(diskDevOut)
	if diskDev == "" {
		diskDev = "sda"
	}
	ioOut, _ := sshClient.ExecuteCommand(fmt.Sprintf(`cat /proc/diskstats | grep ' %s ' | awk '{print $6, $10}'`, diskDev))
	ioParts := strings.Fields(strings.TrimSpace(ioOut))
	ioRxStr, ioTxStr := "0", "0"
	var currIORx, currIOTx uint64
	if len(ioParts) >= 2 {
		currIORx, _ = strconv.ParseUint(ioParts[0], 10, 64)
		currIOTx, _ = strconv.ParseUint(ioParts[1], 10, 64)
		if !prevTime.IsZero() {
			elapsed := now.Sub(*prevTime).Seconds()
			if elapsed > 0 {
				ioRxStr = formatBytesPerSec(uint64(float64((currIORx-*prevIORx)*512) / elapsed))
				ioTxStr = formatBytesPerSec(uint64(float64((currIOTx-*prevIOTx)*512) / elapsed))
			}
		}
		*prevIORx = currIORx
		*prevIOTx = currIOTx
	}

	*prevTime = now

	stats := ServerStats{
		CPU:    cpu,
		Memory: mem,
		Disk:   disk,
		NetRx:  netRxStr,
		NetTx:  netTxStr,
		IORx:   ioRxStr,
		IOTx:   ioTxStr,
	}
	data, _ := json.Marshal(stats)
	return string(data)
}

func formatBytes(b uint64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := uint64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

func formatBytesPerSec(bps uint64) string {
	const unit = 1024
	if bps < unit {
		return fmt.Sprintf("%d B/s", bps)
	}
	div, exp := uint64(unit), 0
	for n := bps / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB/s", float64(bps)/float64(div), "KMGTPE"[exp])
}

func isAuthError(errStr string) bool {
	// knownhosts 相关错误不是认证错误，不应触发密码输入弹窗
	if strings.Contains(errStr, "knownhosts") {
		return false
	}
	authKeywords := []string{"auth", "password", "handshake", "unable to authenticate", "permission denied"}
	for _, kw := range authKeywords {
		if containsIgnoreCase(errStr, kw) {
			return true
		}
	}
	return false
}

func containsIgnoreCase(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr ||
		len(s) > len(substr) && containsSubstrIgnoreCase(s, substr))
}

func containsSubstrIgnoreCase(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		match := true
		for j := 0; j < len(substr); j++ {
			if toLower(s[i+j]) != toLower(substr[j]) {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

func toLower(c byte) byte {
	if c >= 'A' && c <= 'Z' {
		return c + ('a' - 'A')
	}
	return c
}

type SFTPListResponse struct {
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	Mode      string `json:"mode"`
	ModTime   string `json:"mod_time"`
	IsDir     bool   `json:"is_dir"`
	Username  string `json:"username"`
	Groupname string `json:"groupname"`
}

func HandleSFTPList(c *gin.Context) {
	connID, err := strconv.ParseUint(c.Param("connId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid connection ID"})
		return
	}

	userID := middleware.GetUserID(c)
	path := c.Query("path")
	if path == "" {
		path = "/"
	}
	protocol := c.Query("protocol")
	if protocol == "" {
		protocol = "sftp"
	}

	connection, err := repositories.GetConnectionByIDAndUserID(uint(connID), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	connInfo := decryptConnection(&connection)

	sshClient, err := services.NewSSHClient(connInfo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer sshClient.Close()

	var fileService services.FileService
	if protocol == "scp" {
		fileService, err = services.NewSCPService(sshClient.GetClient())
	} else {
		fileService, err = services.NewSFTPService(sshClient.GetClient())
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer fileService.Close()

	entries, err := fileService.ListDirectory(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Collect unique UIDs and GIDs
	uidSet := make(map[uint32]bool)
	gidSet := make(map[uint32]bool)
	for _, entry := range entries {
		if stat, ok := entry.Sys().(*sftp.FileStat); ok {
			uidSet[stat.UID] = true
			gidSet[stat.GID] = true
		}
	}

	// Get username and groupname mappings via SSH
	usernameMap := make(map[uint32]string)
	groupnameMap := make(map[uint32]string)

	if len(uidSet) > 0 {
		session, err := sshClient.GetClient().NewSession()
		if err == nil {
			var stdout bytes.Buffer
			session.Stdout = &stdout
			if err := session.Run("getent passwd"); err == nil {
				for _, line := range strings.Split(stdout.String(), "\n") {
					parts := strings.Split(line, ":")
					if len(parts) >= 3 {
						var uid uint32
						if _, err := fmt.Sscanf(parts[2], "%d", &uid); err == nil {
							if uidSet[uid] {
								usernameMap[uid] = parts[0]
							}
						}
					}
				}
			}
			session.Close()
		}
	}

	if len(gidSet) > 0 {
		session, err := sshClient.GetClient().NewSession()
		if err == nil {
			var stdout bytes.Buffer
			session.Stdout = &stdout
			if err := session.Run("getent group"); err == nil {
				for _, line := range strings.Split(stdout.String(), "\n") {
					parts := strings.Split(line, ":")
					if len(parts) >= 3 {
						var gid uint32
						if _, err := fmt.Sscanf(parts[2], "%d", &gid); err == nil {
							if gidSet[gid] {
								groupnameMap[gid] = parts[0]
							}
						}
					}
				}
			}
			session.Close()
		}
	}

	var response []SFTPListResponse
	for _, entry := range entries {
		var uid, gid uint32
		if stat, ok := entry.Sys().(*sftp.FileStat); ok {
			uid = stat.UID
			gid = stat.GID
		}
		username := usernameMap[uid]
		if username == "" {
			username = fmt.Sprintf("%d", uid)
		}
		groupname := groupnameMap[gid]
		if groupname == "" {
			groupname = fmt.Sprintf("%d", gid)
		}
		response = append(response, SFTPListResponse{
			Name:      entry.Name(),
			Size:      entry.Size(),
			Mode:      entry.Mode().String(),
			ModTime:   entry.ModTime().Format(time.RFC3339),
			IsDir:     entry.IsDir(),
			Username:  username,
			Groupname: groupname,
		})
	}

	c.JSON(http.StatusOK, gin.H{"path": path, "entries": response})
}

func HandleSFTPDownload(c *gin.Context) {
	connID, err := strconv.ParseUint(c.Param("connId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid connection ID"})
		return
	}

	userID := middleware.GetUserID(c)
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Path is required"})
		return
	}
	protocol := c.Query("protocol")
	if protocol == "" {
		protocol = "sftp"
	}

	connection, err := repositories.GetConnectionByIDAndUserID(uint(connID), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	connInfo := decryptConnection(&connection)

	sshClient, err := services.NewSSHClient(connInfo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer sshClient.Close()

	var fileService services.FileService
	if protocol == "scp" {
		fileService, err = services.NewSCPService(sshClient.GetClient())
	} else {
		fileService, err = services.NewSFTPService(sshClient.GetClient())
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer fileService.Close()

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", path))
	c.Header("Content-Type", "application/octet-stream")

	if err := fileService.DownloadFile(path, c.Writer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
}

func HandleSFTPUpload(c *gin.Context) {
	connID, err := strconv.ParseUint(c.Param("connId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid connection ID"})
		return
	}

	userID := middleware.GetUserID(c)

	// 必须先调用 ParseMultipartForm，再读取字段值。
	// 若先调用 c.PostForm，Gin 内部会使用默认 32MB 限制解析，大文件会被截断。
	if err := c.Request.ParseMultipartForm(500 << 20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form"})
		return
	}

	path := ""
	if values, ok := c.Request.MultipartForm.Value["path"]; ok && len(values) > 0 {
		path = values[0]
	}
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Path is required"})
		return
	}

	protocol := "sftp"
	if values, ok := c.Request.MultipartForm.Value["protocol"]; ok && len(values) > 0 {
		protocol = values[0]
	}
	if protocol == "" {
		protocol = "sftp"
	}

	files := c.Request.MultipartForm.File["file"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File is required"})
		return
	}

	connection, err := repositories.GetConnectionByIDAndUserID(uint(connID), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	connInfo := decryptConnection(&connection)

	sshClient, err := services.NewSSHClient(connInfo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer sshClient.Close()

	var fileService services.FileService
	if protocol == "scp" {
		fileService, err = services.NewSCPService(sshClient.GetClient())
	} else {
		fileService, err = services.NewSFTPService(sshClient.GetClient())
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer fileService.Close()

	var uploaded int
	var failed []string
	for _, fh := range files {
		f, err := fh.Open()
		if err != nil {
			failed = append(failed, fmt.Sprintf("%s: %s", fh.Filename, err.Error()))
			continue
		}
		relPath := fh.Header.Get("X-Relative-Path")
		if relPath == "" {
			relPath = fh.Filename
		}
		remotePath := path + "/" + relPath
		if err := fileService.UploadFile(f, remotePath); err != nil {
			failed = append(failed, fmt.Sprintf("%s: %s", fh.Filename, err.Error()))
		} else {
			uploaded++
		}
		f.Close()
	}

	if len(failed) > 0 && uploaded == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("上传失败: %s", strings.Join(failed, "; "))})
		return
	}

	msg := fmt.Sprintf("%d file(s) uploaded", uploaded)
	if len(failed) > 0 {
		msg += fmt.Sprintf(", %d failed", len(failed))
	}
	c.JSON(http.StatusOK, gin.H{"message": msg})
}

func HandleSFTPDelete(c *gin.Context) {
	connID, err := strconv.ParseUint(c.Param("connId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid connection ID"})
		return
	}

	userID := middleware.GetUserID(c)

	var req struct {
		Path     string `json:"path" binding:"required"`
		Protocol string `json:"protocol"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Protocol == "" {
		req.Protocol = "sftp"
	}

	connection, err := repositories.GetConnectionByIDAndUserID(uint(connID), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	connInfo := decryptConnection(&connection)

	sshClient, err := services.NewSSHClient(connInfo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer sshClient.Close()

	var fileService services.FileService
	if req.Protocol == "scp" {
		fileService, err = services.NewSCPService(sshClient.GetClient())
	} else {
		fileService, err = services.NewSFTPService(sshClient.GetClient())
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer fileService.Close()

	if err := fileService.DeleteFile(req.Path); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Deleted successfully"})
}

func HandleSFTPMkdir(c *gin.Context) {
	connID, err := strconv.ParseUint(c.Param("connId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid connection ID"})
		return
	}

	userID := middleware.GetUserID(c)

	var req struct {
		Path     string `json:"path" binding:"required"`
		Protocol string `json:"protocol"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Protocol == "" {
		req.Protocol = "sftp"
	}

	connection, err := repositories.GetConnectionByIDAndUserID(uint(connID), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	connInfo := decryptConnection(&connection)

	sshClient, err := services.NewSSHClient(connInfo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer sshClient.Close()

	var fileService services.FileService
	if req.Protocol == "scp" {
		fileService, err = services.NewSCPService(sshClient.GetClient())
	} else {
		fileService, err = services.NewSFTPService(sshClient.GetClient())
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer fileService.Close()

	if err := fileService.Mkdir(req.Path); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Directory created successfully"})
}

func HandleSFTPDownloadDir(c *gin.Context) {
	connID, err := strconv.ParseUint(c.Param("connId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid connection ID"})
		return
	}

	userID := middleware.GetUserID(c)
	remotePath := c.Query("path")
	if remotePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Path is required"})
		return
	}
	protocol := c.Query("protocol")
	if protocol == "" {
		protocol = "sftp"
	}

	connection, err := repositories.GetConnectionByIDAndUserID(uint(connID), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	connInfo := decryptConnection(&connection)

	sshClient, err := services.NewSSHClient(connInfo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer sshClient.Close()

	var fileService services.FileService
	if protocol == "scp" {
		fileService, err = services.NewSCPService(sshClient.GetClient())
	} else {
		fileService, err = services.NewSFTPService(sshClient.GetClient())
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer fileService.Close()

	dirName := path.Base(remotePath)
	if dirName == "" || dirName == "/" {
		dirName = "root"
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s.zip", dirName))
	c.Header("Content-Type", "application/zip")

	if err := fileService.DownloadDirectory(remotePath, c.Writer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
}

func HandleSFTPChmod(c *gin.Context) {
	connID, err := strconv.ParseUint(c.Param("connId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid connection ID"})
		return
	}

	userID := middleware.GetUserID(c)

	var req struct {
		Path     string `json:"path" binding:"required"`
		Protocol string `json:"protocol"`
		Mode     string `json:"mode" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Protocol == "" {
		req.Protocol = "sftp"
	}

	connection, err := repositories.GetConnectionByIDAndUserID(uint(connID), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	connInfo := decryptConnection(&connection)

	sshClient, err := services.NewSSHClient(connInfo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer sshClient.Close()

	var fileService services.FileService
	if req.Protocol == "scp" {
		fileService, err = services.NewSCPService(sshClient.GetClient())
	} else {
		fileService, err = services.NewSFTPService(sshClient.GetClient())
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer fileService.Close()

	if err := fileService.Chmod(req.Path, req.Mode); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Permission updated"})
}
