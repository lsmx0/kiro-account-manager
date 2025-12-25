mod config;
mod db;
mod error;
mod handlers;
mod middleware;
mod models;

use axum::{
    routing::{get, post, put, delete},
    Router,
};
use sqlx::mysql::MySqlPoolOptions;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::config::Config;

pub struct AppState {
    pub db: sqlx::MySqlPool,
    pub config: Config,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 加载环境变量
    dotenvy::dotenv().ok();

    // 初始化日志
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 加载配置
    let config = Config::from_env();

    // 连接数据库
    let pool = MySqlPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;

    tracing::info!("数据库连接成功");

    // 初始化数据库表
    db::init_tables(&pool).await?;

    let state = Arc::new(AppState { db: pool, config });

    // CORS 配置
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // 路由
    let app = Router::new()
        // 公开接口
        .route("/api/login", post(handlers::auth::login))
        // 需要认证的接口
        .route("/api/me", get(handlers::auth::get_me))
        .route("/api/account/occupy", post(handlers::account::occupy))
        .route("/api/heartbeat", post(handlers::account::heartbeat))
        .route("/api/sync", get(handlers::sync::get_sync_data))
        .route("/api/sync", post(handlers::sync::post_sync_data))
        .route("/api/sync/account", delete(handlers::sync::delete_sync_account))
        // 用户管理接口（仅管理员）
        .route("/api/users", get(handlers::users::list_users))
        .route("/api/users", post(handlers::users::create_user))
        .route("/api/users/:id", put(handlers::users::update_user))
        .route("/api/users/:id", delete(handlers::users::delete_user))
        // 健康检查
        .route("/health", get(|| async { "OK" }))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", std::env::var("PORT").unwrap_or("8899".into()));
    tracing::info!("服务启动: {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
