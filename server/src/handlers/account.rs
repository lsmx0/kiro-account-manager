use axum::{
    extract::State,
    http::header,
    Json,
};
use chrono::{Duration, Utc};
use std::sync::Arc;

use crate::{
    error::AppResult,
    middleware::extract_claims,
    models::{HeartbeatRequest, HeartbeatResponse, OccupancyInfo, OccupyRequest, OccupyResponse},
    AppState,
};

/// POST /api/account/occupy - 占用 Kiro 账号（严格模式：防抢号）
pub async fn occupy(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(req): Json<OccupyRequest>,
) -> AppResult<Json<OccupyResponse>> {
    // 验证 JWT
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    let claims = extract_claims(auth_header, &state.config.jwt_secret)?;

    // 严格检查：是否已被其他用户占用（120秒内活跃视为占用中）
    let threshold = Utc::now() - Duration::seconds(120);

    let existing: Option<(i64, String)> = sqlx::query_as(
        r#"
        SELECT s.user_id, u.username 
        FROM account_sessions s 
        JOIN users u ON s.user_id = u.id
        WHERE s.kiro_account_id = ? AND s.last_active > ?
        "#,
    )
    .bind(&req.kiro_account_id)
    .bind(threshold)
    .fetch_optional(&state.db)
    .await?;

    if let Some((user_id, username)) = existing {
        if user_id != claims.sub {
            // 被其他用户占用，返回 409
            return Ok(Json(OccupyResponse {
                success: false,
                message: format!("该账号正被 {} 使用中", username),
                occupied_by: Some(username),
            }));
        }
    }

    // 清理当前用户的旧会话（确保一人同一时间只能占一个号）
    sqlx::query("DELETE FROM account_sessions WHERE user_id = ?")
        .bind(claims.sub)
        .execute(&state.db)
        .await?;

    // 插入新的占用记录
    sqlx::query(
        r#"
        INSERT INTO account_sessions (kiro_account_id, user_id, last_active)
        VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), last_active = NOW()
        "#,
    )
    .bind(&req.kiro_account_id)
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    tracing::info!("用户 {} 占用了账号 {}", claims.username, req.kiro_account_id);

    Ok(Json(OccupyResponse {
        success: true,
        message: "占用成功".into(),
        occupied_by: None,
    }))
}

/// POST /api/heartbeat - 心跳（扣费 + 续期锁 + 清理死锁）
pub async fn heartbeat(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(req): Json<HeartbeatRequest>,
) -> AppResult<Json<HeartbeatResponse>> {
    // 验证 JWT
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    let claims = extract_claims(auth_header, &state.config.jwt_secret)?;

    // 管理员不扣费
    let remaining_seconds = if claims.role == "admin" {
        // 查询当前时长（不扣费）
        let (seconds,): (i64,) = sqlx::query_as(
            "SELECT remaining_seconds FROM users WHERE id = ?"
        )
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?;
        seconds
    } else {
        // 扣减 60 秒
        sqlx::query("UPDATE users SET remaining_seconds = GREATEST(0, remaining_seconds - 60) WHERE id = ?")
            .bind(claims.sub)
            .execute(&state.db)
            .await?;

        // 查询剩余时长
        let (seconds,): (i64,) = sqlx::query_as(
            "SELECT remaining_seconds FROM users WHERE id = ?"
        )
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?;
        seconds
    };

    // 续期指定账号的占用锁（如果提供了 active_kiro_account_id）
    if let Some(ref account_id) = req.active_kiro_account_id {
        sqlx::query(
            "UPDATE account_sessions SET last_active = NOW() WHERE kiro_account_id = ? AND user_id = ?"
        )
        .bind(account_id)
        .bind(claims.sub)
        .execute(&state.db)
        .await?;
    }

    // 清理僵尸会话（超过 120 秒未活跃的会话）
    let threshold = Utc::now() - Duration::seconds(120);
    sqlx::query("DELETE FROM account_sessions WHERE last_active < ?")
        .bind(threshold)
        .execute(&state.db)
        .await?;

    // 获取全量占用状态
    let occupancy: Vec<OccupancyInfo> = sqlx::query_as(
        r#"
        SELECT s.kiro_account_id, s.user_id, u.username
        FROM account_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.last_active > ?
        "#,
    )
    .bind(Utc::now() - Duration::seconds(120))
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|(kiro_account_id, user_id, username): (String, i64, String)| OccupancyInfo {
        kiro_account_id,
        user_id,
        username,
    })
    .collect();

    let status = if remaining_seconds > 0 { "active" } else { "expired" };

    Ok(Json(HeartbeatResponse {
        status: status.into(),
        remaining_seconds,
        occupancy_map: occupancy,
    }))
}
