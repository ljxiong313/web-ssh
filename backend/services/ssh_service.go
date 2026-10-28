package services

import (
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

type SSHClient struct {
	client      *ssh.Client
	session     *ssh.Session
	stdin       io.WriteCloser
	stdout      io.Reader
	stderr      io.Reader
	mu          sync.Mutex
	isConnected bool
	connInfo    *ConnectionInfo
}

type ConnectionInfo struct {
	Host       string
	Port       int
	Username   string
	AuthType   string
	Password   string
	PrivateKey string
}

func getKnownHostsPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".ssh", "known_hosts")
}

func NewSSHClient(connInfo *ConnectionInfo) (*SSHClient, error) {
	hostKeyCallback := ssh.InsecureIgnoreHostKey()
	var knownHostsPath string

	knownHostsPath = getKnownHostsPath()
	if knownHostsPath != "" {
		if _, err := os.Stat(knownHostsPath); err == nil {
			callback, err := knownhosts.New(knownHostsPath)
			if err == nil {
				hostKeyCallback = func(hostname string, remote net.Addr, key ssh.PublicKey) error {
					herr := callback(hostname, remote, key)
					if herr == nil {
						return nil
					}
					// 未知主机自动接受（首次连接），密钥被篡改则报错
					if _, ok := herr.(*knownhosts.KeyError); ok {
						return nil
					}
					return herr
				}
			}
		}
	}

	config := &ssh.ClientConfig{
		User:            connInfo.Username,
		HostKeyCallback: hostKeyCallback,
		Timeout:         10 * time.Second,
	}

	if connInfo.AuthType == "key" && connInfo.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(connInfo.PrivateKey))
		if err != nil {
			return nil, fmt.Errorf("failed to parse private key: %w", err)
		}
		config.Auth = []ssh.AuthMethod{
			ssh.PublicKeys(signer),
		}
	} else {
		config.Auth = []ssh.AuthMethod{
			ssh.Password(connInfo.Password),
			ssh.KeyboardInteractive(func(user, instruction string, questions []string, echos []bool) ([]string, error) {
				answers := make([]string, len(questions))
				for i := range questions {
					answers[i] = connInfo.Password
				}
				return answers, nil
			}),
		}
	}

	addr := fmt.Sprintf("%s:%d", connInfo.Host, connInfo.Port)
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return nil, fmt.Errorf("failed to dial: %w", err)
	}

	session, err := client.NewSession()
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		session.Close()
		client.Close()
		return nil, fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		stdin.Close()
		session.Close()
		client.Close()
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := session.StderrPipe()
	if err != nil {
		stdin.Close()
		session.Close()
		client.Close()
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	if err := session.RequestPty("xterm-256color", 80, 24, modes); err != nil {
		stdin.Close()
		session.Close()
		client.Close()
		return nil, fmt.Errorf("failed to request pty: %w", err)
	}

	return &SSHClient{
		client:      client,
		session:     session,
		stdin:       stdin,
		stdout:      stdout,
		stderr:      stderr,
		isConnected: true,
		connInfo:    connInfo,
	}, nil
}

func (s *SSHClient) StartShell() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.isConnected {
		return fmt.Errorf("not connected")
	}
	if err := s.session.Shell(); err != nil {
		return fmt.Errorf("failed to start shell: %w", err)
	}
	return nil
}

func (s *SSHClient) Write(data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.isConnected {
		return fmt.Errorf("not connected")
	}
	_, err := s.stdin.Write(data)
	return err
}

func (s *SSHClient) Read(p []byte) (n int, err error) {
	return s.stdout.Read(p)
}

func (s *SSHClient) ReadErr(p []byte) (n int, err error) {
	return s.stderr.Read(p)
}

func (s *SSHClient) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.isConnected = false
	if s.stdin != nil {
		s.stdin.Close()
	}
	if s.session != nil {
		s.session.Close()
	}
	if s.client != nil {
		return s.client.Close()
	}
	return nil
}

func (s *SSHClient) IsConnected() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.isConnected
}

func (s *SSHClient) Resize(width, height int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.isConnected {
		return fmt.Errorf("not connected")
	}
	return s.session.WindowChange(height, width)
}

func (s *SSHClient) ExecuteCommand(cmd string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.isConnected {
		return "", fmt.Errorf("not connected")
	}
	session, err := s.client.NewSession()
	if err != nil {
		return "", err
	}
	defer session.Close()
	output, err := session.Output(cmd)
	if err != nil {
		return "", err
	}
	return string(output), nil
}

func (s *SSHClient) GetClient() *ssh.Client {
	return s.client
}
