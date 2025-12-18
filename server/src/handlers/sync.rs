use axum::{
    extract::State,
    http::header,
    Json,
};
use chrono::Utc;
use std::sync::Arc;

use crate::{
    error::{AppError, AppResult},
    middleware::extract_claims,
    models::{GlobalSyncData, SyncGetResponse, SyncPostRequest, SyncPostResponse},
    AppState,
};

/// GET /api/sync - 获取云端同步数据
pub async fn get_sync_data(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> AppResult<Json<SyncGetResponse>> {
    // 验证 JWT（仅登录用户可拉取）
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    let _claims = extract_claims(auth_header, &state.config.jwt_secret)?;

    // 查询同步数据
    let data: Option<GlobalSyncData> = sqlx::query_as(
        "SELECT id, cipher_text, version, updated_at FROM global_sync_data WHERE id = 1"
    )
    .fetch_optional(&state.db)
    .await?;

    let data = data.ok_or_else(|| AppError::NotFound("同步数据不存在".into()))?;

    Ok(Json(SyncGetResponse {
        data: data.cipher_text.unwrap_or_default(),
        version: data.version,
    }))
}

/// POST /api/sync - 上传同步数据（所有登录用户可用）
pub async fn post_sync_data(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(req): Json<SyncPostRequest>,
) -> AppResult<Json<SyncPostResponse>> {
    // 验证 JWT（任何登录用户都可以上传）
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    let claims = extract_claims(auth_header, &state.config.jwt_secret)?;

    // 获取当前版本号
    let (current_version,): (i64,) = sqlx::query_as(
        "SELECT version FROM global_sync_data WHERE id = 1"
    )
    .fetch_one(&state.db)
    .await?;

    // 乐观锁检查：如果服务器版本 > 0 且客户端版本不匹配，返回 409
    if current_version > 0 && req.based_on_version != current_version {
        return Err(AppError::Conflict);
    }

    // 生成新版本号（时间戳）
    let new_version = Utc::now().timestamp();

    // 更新数据
    sqlx::query(
        "UPDATE global_sync_data SET cipher_text = ?, version = ? WHERE id = 1"
    )
    .bind(&req.data)
    .bind(new_version)
    .execute(&state.db)
    .await?;

    tracing::info!(
        "用户 {} 更新了同步数据，版本: {} -> {}",
        claims.username,
        req.based_on_version,
        new_version
    );

    Ok(Json(SyncPostResponse { new_version }))
}
