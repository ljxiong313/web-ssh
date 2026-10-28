# WebSSH 登录认证与 Token 管理分析

> ⚠️ 本文档为 2026-06-30 的历史分析快照。第四节所列"无自动刷新 / 401 直接登出"等缺陷已在后续版本修复
> （见 `src/client/api.ts` 的 401 重试与 `backend/config/env.go` 的 `ACCESS_TOKEN_EXPIRY`/`REFRESH_TOKEN_EXPIRY`），
> 阅读时请以当前代码为准。

> 分析时间：2026-06-30
> 分析范围：后端认证中间件、前端 Token 管理、401 处理流程

---

## 一、Token 体系概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        双 Token 架构                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Access Token (访问令牌)          Refresh Token (刷新令牌)      │
│   ├── 有效期：30 分钟               ├── 有效期：7 天              │
│   ├── 存储：localStorage            ├── 存储：localStorage        │
│   ├── 载荷：user_id + email         ├── 载荷：user_id + type      │
│   ├── 算法：HS256                   ├── 算法：HS256               │
│   └── 后端不存储                    └── 后端存储 SHA256 哈希      │
│                                                                 │
│   用途：API 请求鉴权                 用途：换取新的 Access Token   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、Token 生成逻辑

### 2.1 Access Token

```go
// backend/middleware/auth.go
func GenerateToken(userID uint, email string) (string, error) {
    claims := jwt.MapClaims{
        "user_id": userID,
        "email":   email,
        "exp":     time.Now().Add(time.Minute * 30).Unix(),  // 30分钟
        "iat":     time.Now().Unix(),
    }
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(jwtSecret)
}
```

| 属性 | 值 |
|------|-----|
| 算法 | HS256 |
| 密钥 | 环境变量 `JWT_SECRET` |
| 载荷 | `user_id`, `email`, `exp`, `iat` |
| **有效期** | **30 分钟** |

### 2.2 Refresh Token

```go
// backend/middleware/auth.go
func GenerateRefreshToken(userID uint) (string, error) {
    claims := jwt.MapClaims{
        "user_id": userID,
        "type":    "refresh",
        "exp":     time.Now().Add(time.Hour * 24 * 7).Unix(),  // 7天
        "iat":     time.Now().Unix(),
    }
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(jwtSecret)
}
```

| 属性 | 值 |
|------|-----|
| 算法 | HS256 |
| 密钥 | 环境变量 `JWT_SECRET` |
| 载荷 | `user_id`, `type="refresh"`, `exp`, `iat` |
| **有效期** | **7 天** |

### 2.3 生成时机

登录成功后同时生成两个 Token：
- `Register`（注册）
- `Login`（登录）

---

## 三、Token 存储位置

### 3.1 前端存储

```typescript
// src/ctx.tsx
const TOKEN_KEY = 'ssh_manager_token';           // Access Token
const REFRESH_TOKEN_KEY = 'ssh_manager_refresh_token';  // Refresh Token
const USER_KEY = 'ssh_manager_user';             // 用户信息
```

| 数据 | 存储位置 | 风险 |
|------|---------|------|
| Access Token | localStorage | XSS 可窃取 |
| Refresh Token | localStorage | XSS 可窃取 |
| 用户信息 | localStorage | XSS 可窃取 |

### 3.2 后端存储

Refresh Token 存储在数据库 `refresh_tokens` 表：

```go
// backend/middleware/auth.go
func SaveRefreshToken(userID uint, token string) error {
    tokenHash := HashToken(token)  // SHA256 哈希，不存明文
    family := hex.EncodeToString(hashTokenFamily(userID))
    rt := models.RefreshToken{
        UserID:    userID,
        TokenHash: tokenHash,
        Family:    family,
        ExpiresAt: time.Now().Add(time.Hour * 24 * 7),
    }
    return config.GetDB().Create(&rt).Error
}
```

| 字段 | 说明 |
|------|------|
| `TokenHash` | SHA256 哈希值（不存明文） |
| `Family` | Token 家族标识（同一用户的 Token 属于同一家族） |
| `ExpiresAt` | 7 天后过期 |

Access Token **不存储在后端**（纯 JWT 自包含）。

---

## 四、Token 刷新机制

### 4.1 后端刷新接口

```go
// backend/handlers/auth.go
func RefreshToken(c *gin.Context) {
    // 1. 解析请求中的 refresh_token
    // 2. 验证 JWT 签名和过期时间
    // 3. 验证 type="refresh"
    // 4. 验证数据库中存在该 Token 哈希
    // 5. 生成新的 Access Token
    // 6. 生成新的 Refresh Token
    // 7. 【Token Rotation】废除旧的 Refresh Token
    // 8. 保存新的 Refresh Token
}
```

### 4.2 前端刷新函数

```typescript
// src/ctx.tsx
const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    const stored = loadStored();
    if (!stored) return false;
    try {
      const res = await authApi.refreshToken(stored.refreshToken);
      const newSession = { ...stored, token: res.token, refreshToken: res.refresh_token };
      setToken(res.token);
      setRefreshToken(res.refresh_token);
      saveStored(newSession);
      setSession(newSession);
      return true;
    } catch {
      signOut();
      return false;
    }
}, [signOut]);
```

### 4.3 ⚠️ 关键缺陷：没有自动刷新

**当前实现中，前端没有定时自动刷新机制**：

- ❌ 没有 `setInterval` 在 Token 过期前主动刷新
- ❌ 没有请求拦截器在发送前检查 Token 是否即将过期
- ❌ 401 返回后**直接登出**，而不是尝试刷新

**实际效果**：
> 用户登录后，如果 30 分钟内没有任何操作，第 31 分钟发起请求时会收到 401，然后被**强制登出**。

**标准双 Token 流程应该是**：
```
Access Token 即将过期（或已过期）
        │
        ▼
前端自动调用 refreshAccessToken()
        │
        ▼
用 Refresh Token 换取新的 Access Token + 新的 Refresh Token
        │
        ▼
继续原请求
```

**当前实际流程**：
```
Access Token 过期
        │
        ▼
请求返回 401
        │
        ▼
直接登出，跳转登录页
```

---

## 五、401 认证失效处理

### 5.1 后端返回 401 的场景

```go
// backend/middleware/auth.go - AuthMiddleware
1. Authorization Header 缺失 → 401 "Authorization header required"
2. 格式错误（非 Bearer） → 401 "Invalid authorization header format"
3. Token 解析失败（过期/签名无效） → 401 "Invalid or expired token"
4. Claims 无效 → 401 "Invalid token claims"
5. 用户不存在 → 401 "User not found"
```

### 5.2 前端处理

```typescript
// src/client/api.ts
function handleAuthError(status: number, message: string) {
    if (_isHandlingAuthError || !isAuthError(status, message)) return;
    _isHandlingAuthError = true;
    _onAuthError?.();  // 调用登出回调
}
```

```typescript
// src/ctx.tsx
setOnAuthError(() => {
    signOut();
    navigate('/sign-in', { replace: true });
});
```

**处理结果**：收到 401 → 清理 localStorage → 跳转登录页

**⚠️ 没有尝试刷新 Token！**

---

## 六、Token 轮换（Rotation）

### ✅ 已实现

每次刷新时：
1. 生成新的 Access Token
2. 生成新的 Refresh Token
3. **从数据库删除旧的 Refresh Token**
4. 保存新的 Refresh Token

```go
// backend/handlers/auth.go
middleware.RevokeRefreshToken(req.RefreshToken)      // 删除旧 Token
middleware.SaveRefreshToken(user.ID, newRefreshToken) // 保存新 Token
```

**安全效果**：即使 Refresh Token 被窃取，也只能使用一次（下次即失效）。

---

## 七、并发刷新问题

### ⚠️ 存在 Race Condition

**后端**：`Revoke` 和 `Save` 不是原子操作
```go
// 非原子操作！
middleware.RevokeRefreshToken(req.RefreshToken)  // DELETE
middleware.SaveRefreshToken(user.ID, newRefreshToken)  // INSERT
```

**风险场景**：
- 用户快速双击刷新按钮
- 多个浏览器标签页同时刷新
- 结果：一个请求成功，其他请求因旧 Token 已被删除而 401

**前端**：没有刷新请求锁
```typescript
// 没有锁机制
const refreshAccessToken = async () => {
    // 多个请求可能同时调用
}
```

---

## 八、时间配置汇总

| 配置项 | 当前值 | 配置方式 | 建议 |
|--------|--------|---------|------|
| Access Token 有效期 | 30 分钟 | 硬编码 | 提取到环境变量 |
| Refresh Token 有效期 | 7 天 | 硬编码 | 提取到环境变量 |
| Refresh Token 数据库过期 | 7 天 | 硬编码 | 与 JWT 一致 |
| 自动刷新提前时间 | 无 | N/A | 建议 Token 过期前 5 分钟 |

---

## 九、安全评估

### 已实现的防护

| 特性 | 状态 | 说明 |
|------|------|------|
| 双 Token 架构 | ✅ | Access + Refresh |
| Token Rotation | ✅ | 每次刷新轮换 |
| Refresh Token 哈希存储 | ✅ | 数据库存 SHA256 |
| 密码修改废除 Token | ✅ | 修改密码后所有 Refresh Token 失效 |
| 登出废除 Token | ✅ | 登出时删除 Refresh Token |

### 存在的问题

| 问题 | 风险等级 | 说明 |
|------|---------|------|
| **没有自动刷新** | 🔴 高 | 30 分钟后强制登出 |
| **401 不尝试刷新** | 🔴 高 | 直接登出而非恢复会话 |
| **Token 存 localStorage** | 🟡 中 | XSS 可窃取 |
| **过期时间硬编码** | 🟡 中 | 无法灵活配置 |
| **并发刷新无锁** | 🟡 中 | Race condition |
| **Token Family 未使用** | 🟢 低 | 可用于检测重用攻击 |

---

## 十、改进建议

### 优先级：高

1. **添加请求拦截器自动刷新**
   ```typescript
   // 在 api.ts request 函数中
   if (token即将过期 && 有refreshToken) {
       await refreshAccessToken();
   }
   ```

2. **401 时先尝试刷新**
   ```typescript
   // 收到 401 时
   const refreshed = await refreshAccessToken();
   if (refreshed) {
       重试原请求;
   } else {
       登出;
   }
   ```

### 优先级：中

3. **过期时间提取到环境变量**
   ```go
   // config/env.go
   AccessTokenExpiry  = getEnvDuration("ACCESS_TOKEN_EXPIRY", 30*time.Minute)
   RefreshTokenExpiry = getEnvDuration("REFRESH_TOKEN_EXPIRY", 7*24*time.Hour)
   ```

4. **后端刷新接口加事务锁**
   ```go
   // 使用数据库事务包裹 Revoke + Save
   db.Transaction(func(tx *gorm.DB) error {
       RevokeRefreshToken(tx, oldToken)
       SaveRefreshToken(tx, newToken)
   })
   ```

### 优先级：低

5. **考虑 httpOnly Cookie 存储 Refresh Token**
   - 减少 XSS 风险
   - 需要调整前后端交互方式
