package services

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path"
	"strconv"
	"strings"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type SFTPService struct {
	client *sftp.Client
}

func NewSFTPService(sshClient *ssh.Client) (*SFTPService, error) {
	client, err := sftp.NewClient(sshClient)
	if err != nil {
		return nil, fmt.Errorf("failed to create sftp client: %w", err)
	}
	return &SFTPService{client: client}, nil
}

func (s *SFTPService) Close() error {
	if s.client != nil {
		return s.client.Close()
	}
	return nil
}

func (s *SFTPService) ListDirectory(path string) ([]os.FileInfo, error) {
	entries, err := s.client.ReadDir(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}
	return entries, nil
}

func (s *SFTPService) DownloadFile(remotePath string, writer io.Writer) error {
	file, err := s.client.Open(remotePath)
	if err != nil {
		return fmt.Errorf("failed to open remote file: %w", err)
	}
	defer file.Close()

	_, err = io.Copy(writer, file)
	if err != nil {
		return fmt.Errorf("failed to copy file: %w", err)
	}
	return nil
}

func (s *SFTPService) UploadFile(reader io.Reader, remotePath string) error {
	if err := s.client.MkdirAll(path.Dir(remotePath)); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	file, err := s.client.Create(remotePath)
	if err != nil {
		return fmt.Errorf("failed to create remote file: %w", err)
	}
	defer file.Close()

	_, err = io.Copy(file, reader)
	if err != nil {
		return fmt.Errorf("failed to copy file: %w", err)
	}
	return nil
}

func (s *SFTPService) DeleteFile(path string) error {
	info, err := s.client.Stat(path)
	if err != nil {
		return fmt.Errorf("failed to stat path: %w", err)
	}

	if info.IsDir() {
		return s.removeDirRecursive(path)
	}
	return s.client.Remove(path)
}

func (s *SFTPService) removeDirRecursive(path string) error {
	entries, err := s.client.ReadDir(path)
	if err != nil {
		return fmt.Errorf("failed to read directory %s: %w", path, err)
	}
	for _, entry := range entries {
		childPath := path + "/" + entry.Name()
		if entry.IsDir() {
			if err := s.removeDirRecursive(childPath); err != nil {
				return err
			}
		} else {
			if err := s.client.Remove(childPath); err != nil {
				return fmt.Errorf("failed to remove %s: %w", childPath, err)
			}
		}
	}
	return s.client.RemoveDirectory(path)
}

func (s *SFTPService) Mkdir(path string) error {
	return s.client.MkdirAll(path)
}

func (s *SFTPService) Stat(path string) (os.FileInfo, error) {
	return s.client.Stat(path)
}

func (s *SFTPService) Chmod(path string, mode string) error {
	perm, err := strconv.ParseUint(mode, 8, 32)
	if err != nil {
		return fmt.Errorf("invalid mode: %s", mode)
	}
	return s.client.Chmod(path, os.FileMode(perm))
}

// DownloadDirectory creates a zip archive of the remote directory and writes it to writer.
func (s *SFTPService) DownloadDirectory(remotePath string, writer io.Writer) error {
	zw := zip.NewWriter(writer)
	defer zw.Close()

	info, err := s.client.Stat(remotePath)
	if err != nil {
		return fmt.Errorf("failed to stat directory: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("%s is not a directory", remotePath)
	}

	dirName := path.Base(remotePath)

	var walk func(dirPath string) error
	walk = func(dirPath string) error {
		entries, err := s.client.ReadDir(dirPath)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			fullPath := dirPath + "/" + entry.Name()
			// Calculate relative path from remotePath to fullPath
			relPath := strings.TrimPrefix(fullPath, remotePath)
			relPath = strings.TrimPrefix(relPath, "/")
			zipPath := dirName + "/" + relPath

			if entry.IsDir() {
				f, err := zw.CreateHeader(&zip.FileHeader{
					Name:   zipPath + "/",
					Method: zip.Store,
				})
				if err != nil {
					return err
				}
				_ = f
				if err := walk(fullPath); err != nil {
					return err
				}
			} else {
				rf, err := s.client.Open(fullPath)
				if err != nil {
					return err
				}
				header := &zip.FileHeader{
					Name:   zipPath,
					Method: zip.Deflate,
				}
				wf, err := zw.CreateHeader(header)
				if err != nil {
					rf.Close()
					return err
				}
				if _, err := io.Copy(wf, rf); err != nil {
					rf.Close()
					return err
				}
				rf.Close()
			}
		}
		return nil
	}

	return walk(remotePath)
}
