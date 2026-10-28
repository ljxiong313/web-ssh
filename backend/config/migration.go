package config

import (
	"log"

	"webssh-backend/models"
)

// personalScopeTables 是带 user_id 且 workspace_id 可为 NULL 的个人资源表。
var personalScopeTables = []string{
	"connections",
	"folders",
	"quick_commands",
	"command_histories",
	"port_forwards",
}

// zeroScopeTables 是 workspace_id 为非空整型、历史数据以 0 表示“未归属”的表。
var zeroScopeTables = []string{
	"terminal_recordings",
	"command_audit_logs",
}

// BackfillPersonalWorkspace 把历史上未归属任何 Workspace 的个人数据挂到该用户的个人 Workspace。
// 请求未携带 X-Workspace-ID 时统一回退到个人 Workspace，因此历史数据必须一并归位，
// 否则旧数据会在列表中“消失”。多次执行结果一致。
func BackfillPersonalWorkspace() {
	var workspaces []models.Workspace
	if err := DB.Order("id asc").Find(&workspaces).Error; err != nil {
		log.Printf("[WARN] skip personal workspace backfill: %v", err)
		return
	}

	claimed := make(map[uint]bool)
	for _, workspace := range workspaces {
		if claimed[workspace.OwnerID] {
			continue
		}
		claimed[workspace.OwnerID] = true

		for _, table := range personalScopeTables {
			if err := DB.Exec("UPDATE "+table+" SET workspace_id = ? WHERE workspace_id IS NULL AND user_id = ?",
				workspace.ID, workspace.OwnerID).Error; err != nil {
				log.Printf("[WARN] backfill %s into workspace %d failed: %v", table, workspace.ID, err)
			}
		}
		for _, table := range zeroScopeTables {
			if err := DB.Exec("UPDATE "+table+" SET workspace_id = ? WHERE (workspace_id IS NULL OR workspace_id = 0) AND user_id = ?",
				workspace.ID, workspace.OwnerID).Error; err != nil {
				log.Printf("[WARN] backfill %s into workspace %d failed: %v", table, workspace.ID, err)
			}
		}
	}
}
