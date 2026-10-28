package repositories

import (
	"webssh-backend/config"
	"webssh-backend/models"

	"gorm.io/gorm"
)

func GetFoldersByUserAndWorkspace(userID uint, workspaceID *uint) ([]models.Folder, error) {
	var folders []models.Folder
	db := config.GetDB()
	if workspaceID != nil {
		db = db.Where("user_id = ? AND workspace_id = ?", userID, *workspaceID)
	} else {
		db = db.Where("user_id = ? AND workspace_id IS NULL", userID)
	}
	err := db.Order("sort_order, id").Find(&folders).Error
	return folders, err
}

func GetFolderByIDAndUserID(id uint, userID uint) (models.Folder, error) {
	var folder models.Folder
	err := config.GetDB().Where("id = ? AND user_id = ?", id, userID).First(&folder).Error
	return folder, err
}

func CreateFolder(folder *models.Folder) error {
	return config.GetDB().Create(folder).Error
}

func SaveFolder(folder *models.Folder) error {
	return config.GetDB().Save(folder).Error
}

func GetChildFolders(parentID uint) ([]models.Folder, error) {
	var children []models.Folder
	err := config.GetDB().Where("parent_id = ?", parentID).Find(&children).Error
	return children, err
}

func GetChildFoldersByUser(parentID uint, userID uint) ([]models.Folder, error) {
	var children []models.Folder
	err := config.GetDB().Where("parent_id = ? AND user_id = ?", parentID, userID).Find(&children).Error
	return children, err
}

func ClearConnectionFolderID(folderID uint, tx *gorm.DB) error {
	if tx == nil {
		tx = config.GetDB()
	}
	return tx.Model(&models.Connection{}).Where("folder_id = ?", folderID).Update("folder_id", nil).Error
}

func DeleteFolderByIDAndUserID(folderID uint, userID uint, tx *gorm.DB) error {
	if tx == nil {
		tx = config.GetDB()
	}
	return tx.Where("id = ? AND user_id = ?", folderID, userID).Delete(&models.Folder{}).Error
}

func UpdateFolderSortOrder(folderID uint, userID uint, sortOrder int, tx *gorm.DB) error {
	if tx == nil {
		tx = config.GetDB()
	}
	return tx.Model(&models.Folder{}).Where("id = ? AND user_id = ?", folderID, userID).Update("sort_order", sortOrder).Error
}

func GetFolderDepth(folderID uint) (int, error) {
	var depth int
	currentID := folderID
	for currentID > 0 {
		var folder models.Folder
		if err := config.GetDB().Where("id = ?", currentID).First(&folder).Error; err != nil {
			return 0, err
		}
		if folder.ParentID == nil {
			break
		}
		currentID = *folder.ParentID
		depth++
	}
	return depth, nil
}

func GetSubtreeDepth(folderID uint) (int, error) {
	var maxDepth int
	var queue []struct {
		id    uint
		depth int
	}
	queue = append(queue, struct {
		id    uint
		depth int
	}{id: folderID, depth: 0})

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if current.depth > maxDepth {
			maxDepth = current.depth
		}

		children, err := GetChildFolders(current.id)
		if err != nil {
			return 0, err
		}
		for _, child := range children {
			queue = append(queue, struct {
				id    uint
				depth int
			}{id: child.ID, depth: current.depth + 1})
		}
	}
	return maxDepth, nil
}

func IsDescendant(parentID, childID uint) (bool, error) {
	if parentID == childID {
		return true, nil
	}
	currentID := childID
	for currentID > 0 {
		var folder models.Folder
		if err := config.GetDB().Where("id = ?", currentID).First(&folder).Error; err != nil {
			return false, err
		}
		if folder.ParentID == nil {
			break
		}
		if *folder.ParentID == parentID {
			return true, nil
		}
		currentID = *folder.ParentID
	}
	return false, nil
}

func DeleteFolderRecursive(folderID uint, userID uint, tx *gorm.DB) error {
	if tx == nil {
		tx = config.GetDB()
	}
	var children []models.Folder
	if err := tx.Where("parent_id = ? AND user_id = ?", folderID, userID).Find(&children).Error; err != nil {
		return err
	}
	for _, child := range children {
		if err := DeleteFolderRecursive(child.ID, userID, tx); err != nil {
			return err
		}
	}

	if err := tx.Model(&models.Connection{}).Where("folder_id = ?", folderID).Update("folder_id", nil).Error; err != nil {
		return err
	}

	if err := tx.Where("id = ? AND user_id = ?", folderID, userID).Delete(&models.Folder{}).Error; err != nil {
		return err
	}
	return nil
}
