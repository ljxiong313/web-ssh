package services

import (
	"io"
	"os"
)

// FileService defines the common interface for file operations
type FileService interface {
	ListDirectory(path string) ([]os.FileInfo, error)
	DownloadFile(remotePath string, writer io.Writer) error
	DownloadDirectory(remotePath string, writer io.Writer) error
	UploadFile(reader io.Reader, remotePath string) error
	DeleteFile(path string) error
	Mkdir(path string) error
	Stat(path string) (os.FileInfo, error)
	Chmod(path string, mode string) error
	Close() error
}
