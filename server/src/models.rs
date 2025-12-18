use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// 用户角色
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "VARCHAR")]
#[sqlx(rename_all = "lowercase")]
pub enum UserRole {
    Admin,
    User,
}

impl Default for UserRole {
    fn default() -> Self {
        Self::User
    }
}

/// 用户
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct User {
    pub id: i64,
    pub username: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub role: String,
    pub remaining_seconds: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 账号占用会话
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct AccountSession {
    pub id: i64,
    pub kiro_account_id: String,
    pub user_id: i64,
    pub last_active: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

/// 全局同步数据
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct GlobalSyncData {
    pub id: i32,
    pub cipher_text: Option<String>,
    pub version: i64,
    pub updated_at: DateTime<Utc>,
}

// ==================== 请求/响应结构 ====================

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub role: String,
    pub remaining_seconds: i64,
}

#[derive(Debug, Deserialize)]
pub struct OccupyRequest {
    pub kiro_account_id: String,
}

#[derive(Debug, Serialize)]
pub struct OccupyResponse {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub occupied_by: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct HeartbeatRequest {
    #[serde(default)]
    pub active_kiro_account_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct HeartbeatResponse {
    pub status: String,
    pub remaining_seconds: i64,
    pub occupancy_map: Vec<OccupancyInfo>,
}

#[derive(Debug, Serialize)]
pub struct OccupancyInfo {
    pub kiro_account_id: String,
    pub user_id: i64,
    pub username: String,
}

#[derive(Debug, Serialize)]
pub struct SyncGetResponse {
    pub data: String,
    pub version: i64,
}

#[derive(Debug, Deserialize)]
pub struct SyncPostRequest {
    pub data: String,
    #[serde(rename = "basedOnVersion")]
    pub based_on_version: i64,
}

#[derive(Debug, Serialize)]
pub struct SyncPostResponse {
    #[serde(rename = "newVersion")]
    pub new_version: i64,
}

// ==================== JWT Claims ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: i64,        // user_id
    pub username: String,
    pub role: String,
    pub exp: i64,        // 过期时间
    pub iat: i64,        // 签发时间
}
