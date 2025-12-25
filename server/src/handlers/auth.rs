use argon2::{password_hash::PasswordVerifier, Argon2, PasswordHash};
use axum::{extract::State, http::header, Json};
use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use std::sync::Arc;

use crate::{
    error::{AppError, AppResult},
    middleware::extract_claims,
    models::{Claims, LoginRequest, LoginResponse, User, UserInfo},
    AppState,
};

/// POST /api/login - 用户登录
pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    // 查询用户
    let user: Option<User> = sqlx::query_as(
        "SELECT id, username, password_hash, role, remaining_seconds, created_at, updated_at FROM users WHERE username = ?"
    )
    .bind(&req.username)
    .fetch_optional(&state.db)
    .await?;

    let user = user.ok_or_else(|| AppError::Unauthorized("用户名或密码错误".into()))?;

    // 验证密码
    let parsed_hash = PasswordHash::new(&user.password_hash)
        .map_err(|_| AppError::Internal("密码哈希格式错误".into()))?;

    Argon2::default()
        .verify_password(req.password.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::Unauthorized("用户名或密码错误".into()))?;

    // 检查剩余时长（管理员不受限制）
    if user.role != "admin" && user.remaining_seconds <= 0 {
        return Err(AppError::Forbidden("使用时长已用尽，请联系管理员充值".into()));
    }

    // 生成 JWT
    let now = Utc::now().timestamp();
    let exp = now + state.config.jwt_expiry_hours * 3600;

    let claims = Claims {
        sub: user.id,
        username: user.username.clone(),
        role: user.role.clone(),
        exp,
        iat: now,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(format!("Token 生成失败: {}", e)))?;

    Ok(Json(LoginResponse {
        token,
        user: UserInfo {
            id: user.id,
            username: user.username,
            role: user.role,
            remaining_seconds: user.remaining_seconds,
        },
    }))
}


/// GET /api/me - 获取当前用户信息（验证 token 有效性）
pub async fn get_me(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> AppResult<Json<UserInfo>> {
    // 验证 JWT
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    let claims = extract_claims(auth_header, &state.config.jwt_secret)?;

    // 查询用户最新信息
    let user: Option<User> = sqlx::query_as(
        "SELECT id, username, password_hash, role, remaining_seconds, created_at, updated_at FROM users WHERE id = ?"
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?;

    let user = user.ok_or_else(|| AppError::Unauthorized("用户不存在".into()))?;

    // 检查剩余时长（管理员不受限制）
    if user.role != "admin" && user.remaining_seconds <= 0 {
        return Err(AppError::Forbidden("使用时长已用尽，请联系管理员充值".into()));
    }

    Ok(Json(UserInfo {
        id: user.id,
        username: user.username,
        role: user.role,
        remaining_seconds: user.remaining_seconds,
    }))
}
