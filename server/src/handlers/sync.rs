use axum::{
    extract::State,
    http::header,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{
    error::{AppError, AppResult},
    middleware::extract_claims,
    models::{GlobalSyncData, SyncGetResponse, SyncPostRequest, SyncPostResponse},
    AppState,
};

// 删除账号请求
#[derive(Debug, Deserialize)]
pub struct DeleteAccountRequest {
    pub account_id: String,
}

// 删除账号响应
#[derive(Debug, Serialize)]
pub struct DeleteAccountResponse {
    pub success: bool,
    pub new_version: i64,
}

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


/// DELETE /api/sync/account - 从云端删除指定账号
/// 
/// 这个 API 会：
/// 1. 获取云端加密数据
/// 2. 解密数据
/// 3. 从账号列表中删除指定 ID 的账号
/// 4. 重新加密并保存
pub async fn delete_sync_account(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(req): Json<DeleteAccountRequest>,
) -> AppResult<Json<DeleteAccountResponse>> {
    // 验证 JWT
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    let claims = extract_claims(auth_header, &state.config.jwt_secret)?;

    // 获取当前云端数据
    let data: Option<GlobalSyncData> = sqlx::query_as(
        "SELECT id, cipher_text, version, updated_at FROM global_sync_data WHERE id = 1"
    )
    .fetch_optional(&state.db)
    .await?;

    let data = data.ok_or_else(|| AppError::NotFound("同步数据不存在".into()))?;
    let cipher_text = data.cipher_text.unwrap_or_default();

    // 解密数据
    let decrypted = decrypt_data(&cipher_text, &state.config.jwt_secret)
        .map_err(|e| AppError::BadRequest(format!("解密失败: {}", e)))?;

    // 解析 JSON
    let mut accounts: Vec<serde_json::Value> = serde_json::from_str(&decrypted)
        .map_err(|e| AppError::BadRequest(format!("JSON 解析失败: {}", e)))?;

    // 删除指定账号
    let original_len = accounts.len();
    accounts.retain(|acc| {
        acc.get("id")
            .and_then(|v| v.as_str())
            .map(|id| id != req.account_id)
            .unwrap_or(true)
    });

    let deleted_count = original_len - accounts.len();
    if deleted_count == 0 {
        tracing::warn!("用户 {} 尝试删除不存在的账号: {}", claims.username, req.account_id);
    }

    // 重新加密
    let new_json = serde_json::to_string(&accounts)
        .map_err(|e| AppError::BadRequest(format!("JSON 序列化失败: {}", e)))?;
    let new_cipher = encrypt_data(&new_json, &state.config.jwt_secret);

    // 生成新版本号
    let new_version = Utc::now().timestamp();

    // 保存
    sqlx::query(
        "UPDATE global_sync_data SET cipher_text = ?, version = ? WHERE id = 1"
    )
    .bind(&new_cipher)
    .bind(new_version)
    .execute(&state.db)
    .await?;

    tracing::info!(
        "用户 {} 从云端删除了账号 {}，删除数量: {}",
        claims.username,
        req.account_id,
        deleted_count
    );

    Ok(Json(DeleteAccountResponse {
        success: true,
        new_version,
    }))
}

// XOR 加密（与前端一致）
fn encrypt_data(data: &str, key: &str) -> String {
    let data_bytes = data.as_bytes();
    let key_bytes = key.as_bytes();
    
    let encrypted: Vec<u8> = data_bytes
        .iter()
        .enumerate()
        .map(|(i, &b)| b ^ key_bytes[i % key_bytes.len()])
        .collect();
    
    base64::encode(&encrypted)
}

// XOR 解密（与前端一致）
fn decrypt_data(encoded: &str, key: &str) -> Result<String, String> {
    let encrypted = base64::decode(encoded)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;
    
    let key_bytes = key.as_bytes();
    
    let decrypted: Vec<u8> = encrypted
        .iter()
        .enumerate()
        .map(|(i, &b)| b ^ key_bytes[i % key_bytes.len()])
        .collect();
    
    String::from_utf8(decrypted)
        .map_err(|e| format!("UTF-8 解码失败: {}", e))
}
