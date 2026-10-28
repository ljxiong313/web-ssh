package services

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"os"
	"path"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

type SCPService struct {
	client *ssh.Client
}

func NewSCPService(sshClient *ssh.Client) (*SCPService, error) {
	return &SCPService{client: sshClient}, nil
}

func (s *SCPService) Close() error {
	return nil // SSH client is managed by caller
}

// ListDirectory uses `ls -la` to list directory contents
func (s *SCPService) ListDirectory(path string) ([]os.FileInfo, error) {
	session, err := s.client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	session.Stdout = &stdout
	session.Stderr = &stderr

	cmd := fmt.Sprintf("ls -la %s", shellQuote(path))
	if err := session.Run(cmd); err != nil {
		return nil, fmt.Errorf("failed to list directory: %s", stderr.String())
	}

	return parseLsOutput(stdout.String())
}

// DownloadFile uses scp to download a file
func (s *SCPService) DownloadFile(remotePath string, writer io.Writer) error {
	session, err := s.client.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	session.Stdout = &stdout
	session.Stderr = &stderr

	cmd := fmt.Sprintf("cat %s", shellQuote(remotePath))
	if err := session.Run(cmd); err != nil {
		return fmt.Errorf("failed to download file: %s", stderr.String())
	}

	_, err = writer.Write(stdout.Bytes())
	return err
}

// UploadFile uses scp to upload a file
func (s *SCPService) UploadFile(reader io.Reader, remotePath string) error {
	// Read file content
	data, err := io.ReadAll(reader)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	session, err := s.client.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	stdin, err := session.StdinPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	var stderr bytes.Buffer
	session.Stderr = &stderr

	filename := path.Base(remotePath)
	cmd := fmt.Sprintf("scp -t %s", shellQuote(remotePath))
	if err := session.Start(cmd); err != nil {
		return fmt.Errorf("failed to start scp: %s", stderr.String())
	}

	// SCP protocol: send file header
	header := fmt.Sprintf("C0644 %d %s\n", len(data), filename)
	if _, err := fmt.Fprint(stdin, header); err != nil {
		return fmt.Errorf("failed to send header: %w", err)
	}

	// Wait for ACK (read from stdout)
	buf := make([]byte, 1)
	if _, err := stdout.Read(buf); err != nil {
		return fmt.Errorf("failed to read ACK: %w", err)
	}
	if buf[0] != 0 {
		// Read error message
		var errBuf bytes.Buffer
		io.Copy(&errBuf, stdout)
		return fmt.Errorf("scp error: %s", errBuf.String())
	}

	// Send file content
	if _, err := stdin.Write(data); err != nil {
		return fmt.Errorf("failed to send data: %w", err)
	}

	// Send trailing null byte
	if _, err := fmt.Fprint(stdin, "\x00"); err != nil {
		return fmt.Errorf("failed to send null byte: %w", err)
	}

	stdin.Close()

	if err := session.Wait(); err != nil {
		return fmt.Errorf("scp failed: %s", stderr.String())
	}

	return nil
}

// DeleteFile uses rm command
func (s *SCPService) DeleteFile(path string) error {
	session, err := s.client.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	var stderr bytes.Buffer
	session.Stderr = &stderr

	// Check if it's a directory
	info, err := s.Stat(path)
	if err != nil {
		return fmt.Errorf("failed to stat path: %w", err)
	}

	var cmd string
	if info.IsDir() {
		cmd = fmt.Sprintf("rm -rf %s", shellQuote(path))
	} else {
		cmd = fmt.Sprintf("rm -f %s", shellQuote(path))
	}

	if err := session.Run(cmd); err != nil {
		return fmt.Errorf("failed to delete: %s", stderr.String())
	}

	return nil
}

// Mkdir uses mkdir -p command
func (s *SCPService) Mkdir(path string) error {
	session, err := s.client.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	var stderr bytes.Buffer
	session.Stderr = &stderr

	cmd := fmt.Sprintf("mkdir -p %s", shellQuote(path))
	if err := session.Run(cmd); err != nil {
		return fmt.Errorf("failed to create directory: %s", stderr.String())
	}

	return nil
}

// Stat uses stat command to get file info
func (s *SCPService) Stat(remotePath string) (os.FileInfo, error) {
	session, err := s.client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	session.Stdout = &stdout
	session.Stderr = &stderr

	cmd := fmt.Sprintf("stat -c '%%s %%Y %%F' %s", shellQuote(remotePath))
	if err := session.Run(cmd); err != nil {
		return nil, fmt.Errorf("failed to stat: %s", stderr.String())
	}

	return parseStatOutput(remotePath, stdout.String())
}

// Chmod uses chmod command to change file permissions
func (s *SCPService) Chmod(path string, mode string) error {
	session, err := s.client.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	var stderr bytes.Buffer
	session.Stderr = &stderr

	cmd := fmt.Sprintf("chmod %s %s", shellQuote(mode), shellQuote(path))
	if err := session.Run(cmd); err != nil {
		return fmt.Errorf("failed to chmod: %s", stderr.String())
	}

	return nil
}

// parseLsOutput parses `ls -la` output
func parseLsOutput(output string) ([]os.FileInfo, error) {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	var entries []os.FileInfo

	for _, line := range lines {
		if strings.HasPrefix(line, "total") || line == "" {
			continue
		}

		info, err := parseLsLine(line)
		if err != nil {
			continue // Skip unparseable lines
		}
		entries = append(entries, info)
	}

	return entries, nil
}

type lsFileInfo struct {
	name    string
	size    int64
	mode    os.FileMode
	modTime time.Time
	isDir   bool
}

func (f *lsFileInfo) Name() string      { return f.name }
func (f *lsFileInfo) Size() int64       { return f.size }
func (f *lsFileInfo) Mode() os.FileMode { return f.mode }
func (f *lsFileInfo) ModTime() time.Time { return f.modTime }
func (f *lsFileInfo) IsDir() bool       { return f.isDir }
func (f *lsFileInfo) Sys() interface{}  { return nil }

func parseLsLine(line string) (os.FileInfo, error) {
	fields := strings.Fields(line)
	if len(fields) < 9 {
		return nil, fmt.Errorf("invalid ls output")
	}

	permStr := fields[0]
	isDir := strings.HasPrefix(permStr, "d")

	// Parse permissions
	mode := parsePermString(permStr)

	// Size
	var size int64
	fmt.Sscanf(fields[4], "%d", &size)

	// Date/time - format varies, try common formats
	dateStr := strings.Join(fields[5:8], " ")
	modTime := parseLsDate(dateStr)

	// Name (may contain spaces)
	name := strings.Join(fields[8:], " ")

	return &lsFileInfo{
		name:    name,
		size:    size,
		mode:    mode,
		modTime: modTime,
		isDir:   isDir,
	}, nil
}

func parsePermString(perm string) os.FileMode {
	var mode os.FileMode
	if strings.HasPrefix(perm, "d") {
		mode |= os.ModeDir
	}
	if strings.Contains(perm, "x") {
		mode |= 0111
	}
	if strings.Contains(perm, "w") {
		mode |= 0222
	}
	if strings.Contains(perm, "r") {
		mode |= 0444
	}
	return mode
}

func parseLsDate(dateStr string) time.Time {
	// Try common ls date formats
	formats := []string{
		"Jan 2 15:04",
		"Jan 02 15:04",
		"Jan 2 2006",
		"Jan 02 2006",
		"2006-01-02 15:04:05",
	}

	for _, format := range formats {
		if t, err := time.Parse(format, dateStr); err == nil {
			// If year is missing, assume current year
			if t.Year() == 0 {
				t = t.AddDate(time.Now().Year(), 0, 0)
			}
			return t
		}
	}

	return time.Now()
}

func parseStatOutput(remotePath string, output string) (os.FileInfo, error) {
	fields := strings.Fields(strings.TrimSpace(output))
	if len(fields) < 3 {
		return nil, fmt.Errorf("invalid stat output")
	}

	var size int64
	var modTime int64
	fileType := fields[2]

	fmt.Sscanf(fields[0], "%d", &size)
	fmt.Sscanf(fields[1], "%d", &modTime)

	isDir := fileType == "directory"

	return &lsFileInfo{
		name:    path.Base(remotePath),
		size:    size,
		mode:    0644,
		modTime: time.Unix(modTime, 0),
		isDir:   isDir,
	}, nil
}

// shellQuote safely quotes a string for shell commands
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'"
}

// DownloadDirectory creates a zip archive of the remote directory using tar over SSH.
func (s *SCPService) DownloadDirectory(remotePath string, writer io.Writer) error {
	session, err := s.client.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	// Get the parent directory and base name
	parentDir := path.Dir(remotePath)
	baseName := path.Base(remotePath)

	// Use tar to stream the directory contents
	var tarBuf bytes.Buffer
	session.Stdout = &tarBuf
	var stderr bytes.Buffer
	session.Stderr = &stderr

	cmd := fmt.Sprintf("cd %s && tar cf - %s", shellQuote(parentDir), shellQuote(baseName))
	if err := session.Run(cmd); err != nil {
		return fmt.Errorf("failed to tar directory: %s", stderr.String())
	}

	// Parse tar and write as zip
	zw := zip.NewWriter(writer)
	defer zw.Close()

	tr := tar.NewReader(&tarBuf)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to read tar: %w", err)
		}

		// Strip the leading directory component from the path
		// tar outputs paths like "dirname/subdir/file", we want "dirname/subdir/file"
		zipPath := header.Name

		if header.Typeflag == tar.TypeDir {
			f, err := zw.CreateHeader(&zip.FileHeader{
				Name:   zipPath,
				Method: zip.Store,
			})
			if err != nil {
				return err
			}
			_ = f
		} else {
			f, err := zw.CreateHeader(&zip.FileHeader{
				Name:   zipPath,
				Method: zip.Deflate,
			})
			if err != nil {
				return err
			}
			if _, err := io.Copy(f, tr); err != nil {
				return err
			}
		}
	}

	return nil
}
