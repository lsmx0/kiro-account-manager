use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use axum::{
    extract::{Path, State},
    http::header,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{
    error::{AppError, AppResult},
    middleware::{extract_claims, require_admin},
    models::User,
    AppState,
};

// ==================== 请求/响应结构 ====================

#[derive(Debug, Serialize)]
pub struct UserListItem {
    pub id: i64,
    pub username: String,
    pub role: String,
    pub remaining_seconds: i64,
    pub remaining_days: f64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub role: Option<String>,
    pub remaining_days: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub password: Option<String>,
    pub role: Option<String>,
    pub remaining_days: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub success: bool,
    pub message: String,
    pub user: Option<UserListItem>,
}

// ==================== API Handlers ====================

/// GET /api/users - 获取用户列表（仅管理员）
pub async fn list_users(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> AppResult<Json<Vec<UserListItem>>> {
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    let claims = extract_claims(auth_header, &state.config.jwt_secret)?;
    require_admin(&claims)?;

    let users: Vec<User> = sqlx::query_as(
        "SELECT id, username, password_hash, role, remaining_seconds, created_at, updated_at FROM users ORDER BY id"
    )
    .fetch_all(&state.db)
    .await?;

    let list: Vec<UserListItem> = users
        .into_iter()
        .map(|u| UserListItem {
            id: u.id,
            username: u.username,
            role: u.role,
            remaining_seconds: u.remaining_seconds,
            remaining_days: u.remaining_seconds as f64 / 86400.0,
            created_at: u.created_at.format("%Y-%m-%d %H:%M").to_string(),
        })
        .collect();

    Ok(Json(list))
}

/// POST /api/users - 创建用户（仅管理员）
pub async fn create_user(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(req): Json<CreateUserRequest>,
) -> AppResult<Json<UserResponse>> {
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    let claims = extract_claims(auth_header, &state.config.jwt_secret)?;
    require_admin(&claims)?;

    // 检查用户名是否已存在
    let exists: Option<(i64,)> = sqlx::query_as("SELECT id FROM users WHERE username = ?")
        .bind(&req.username)
        .fetch_optional(&state.db)
        .await?;

    if exists.is_some() {
        return Err(AppError::BadRequest("用户名已存在".into()));
    }

    // 生成密码哈希
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(req.password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(format!("密码哈希失败: {}", e)))?
        .to_string();

    let role = req.role.unwrap_or_else(|| "user".to_string());
    let remaining_seconds = (req.remaining_days.unwrap_or(0.0) * 86400.0) as i64;

    // 插入用户
    let result = sqlx::query(
        "INSERT INTO users (username, password_hash, role, remaining_seconds) VALUES (?, ?, ?, ?)"
    )
    .bind(&req.username)
    .bind(&password_hash)
    .bind(&role)
    .bind(remaining_seconds)
    .execute(&state.db)
    .await?;

    let user_id = result.last_insert_id() as i64;

    Ok(Json(UserResponse {
        success: true,
        message: "用户创建成功".into(),
        user: Some(UserListItem {
            id: user_id,
            username: req.username,
            role,
            remaining_seconds,
            remaining_days: req.remaining_days.unwrap_or(0.0),
            created_at: chrono::Utc::now().format("%Y-%m-%d %H:%M").to_string(),
        }),
    }))
}

/// PUT /api/users/:id - 更新用户（仅管理员）
pub async fn update_user(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(user_id): Path<i64>,
    Json(req): Json<UpdateUserRequest>,
) -> AppResult<Json<UserResponse>> {
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    let claims = extract_claims(auth_header, &state.config.jwt_secret)?;
    require_admin(&claims)?;

    // 检查用户是否存在
    let user: Option<User> = sqlx::query_as(
        "SELECT id, username, password_hash, role, remaining_seconds, created_at, updated_at FROM users WHERE id = ?"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let user = user.ok_or_else(|| AppError::NotFound("用户不存在".into()))?;

    // 构建更新
    let mut has_password = false;
    let mut new_password_hash = String::new();

    if let Some(password) = &req.password {
        if !password.is_empty() {
            let salt = SaltString::generate(&mut OsRng);
            let argon2 = Argon2::default();
            new_password_hash = argon2
                .hash_password(password.as_bytes(), &salt)
                .map_err(|e| AppError::Internal(format!("密码哈希失败: {}", e)))?
                .to_string();
            has_password = true;
        }
    }

    let new_role = req.role.clone().unwrap_or(user.role.clone());
    let new_remaining_seconds = req
        .remaining_days
        .map(|d| (d * 86400.0) as i64)
        .unwrap_or(user.remaining_seconds);

    if has_password {
        sqlx::query("UPDATE users SET password_hash = ?, role = ?, remaining_seconds = ? WHERE id = ?")
            .bind(&new_password_hash)
            .bind(&new_role)
            .bind(new_remaining_seconds)
            .bind(user_id)
            .execute(&state.db)
            .await?;
    } else {
        sqlx::query("UPDATE users SET role = ?, remaining_seconds = ? WHERE id = ?")
            .bind(&new_role)
            .bind(new_remaining_seconds)
            .bind(user_id)
            .execute(&state.db)
            .await?;
    }

    Ok(Json(UserResponse {
        success: true,
        message: "用户更新成功".into(),
        user: Some(UserListItem {
            id: user_id,
            username: user.username,
            role: new_role,
            remaining_seconds: new_remaining_seconds,
            remaining_days: new_remaining_seconds as f64 / 86400.0,
            created_at: user.created_at.format("%Y-%m-%d %H:%M").to_string(),
        }),
    }))
}

/// DELETE /api/users/:id - 删除用户（仅管理员）
pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(user_id): Path<i64>,
) -> AppResult<Json<UserResponse>> {
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    let claims = extract_claims(auth_header, &state.config.jwt_secret)?;
    require_admin(&claims)?;

    // 不能删除自己
    if claims.sub == user_id {
        return Err(AppError::BadRequest("不能删除自己".into()));
    }

    // 检查用户是否存在
    let user: Option<(String,)> = sqlx::query_as("SELECT username FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?;

    let (username,) = user.ok_or_else(|| AppError::NotFound("用户不存在".into()))?;

    // 删除用户
    sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(user_id)
        .execute(&state.db)
        .await?;

    Ok(Json(UserResponse {
        success: true,
        message: format!("用户 {} 已删除", username),
        user: None,
    }))
}
