package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateLimiter struct {
	attempts map[string]int
	resetAt  map[string]time.Time
	mu       sync.RWMutex
}

var loginLimiter = &rateLimiter{
	attempts: make(map[string]int),
	resetAt:  make(map[string]time.Time),
}

func LoginRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		loginLimiter.mu.Lock()
		now := time.Now()

		if resetTime, ok := loginLimiter.resetAt[ip]; ok && now.After(resetTime) {
			delete(loginLimiter.attempts, ip)
			delete(loginLimiter.resetAt, ip)
		}

		if loginLimiter.attempts[ip] >= 5 {
			loginLimiter.mu.Unlock()
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many login attempts, please try again later"})
			c.Abort()
			return
		}
		loginLimiter.mu.Unlock()
		c.Next()
	}
}

func RecordFailedLogin(ip string) {
	loginLimiter.mu.Lock()
	defer loginLimiter.mu.Unlock()
	loginLimiter.attempts[ip]++
	if _, ok := loginLimiter.resetAt[ip]; !ok {
		loginLimiter.resetAt[ip] = time.Now().Add(15 * time.Minute)
	}
}

func ClearLoginAttempts(ip string) {
	loginLimiter.mu.Lock()
	defer loginLimiter.mu.Unlock()
	delete(loginLimiter.attempts, ip)
	delete(loginLimiter.resetAt, ip)
}
