use sqlx::MySqlPool;

/// 初始化数据库表
pub async fn init_tables(pool: &MySqlPool) -> anyhow::Result<()> {
    // 用户表
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            username VARCHAR(100) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            remaining_seconds BIGINT NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
        "#,
    )
    .execute(pool)
    .await?;

    // 账号占用会话表
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS account_sessions (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            kiro_account_id VARCHAR(255) NOT NULL,
            user_id BIGINT NOT NULL,
            last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_kiro_account (kiro_account_id),
            INDEX idx_user_id (user_id),
            INDEX idx_last_active (last_active)
        )
        "#,
    )
    .execute(pool)
    .await?;

    // 全局同步数据表
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS global_sync_data (
            id INT PRIMARY KEY DEFAULT 1,
            cipher_text LONGTEXT,
            version BIGINT NOT NULL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
        "#,
    )
    .execute(pool)
    .await?;

    // 确保 global_sync_data 有初始记录
    sqlx::query(
        r#"
        INSERT IGNORE INTO global_sync_data (id, cipher_text, version) VALUES (1, '', 0)
        "#,
    )
    .execute(pool)
    .await?;

    tracing::info!("数据库表初始化完成");
    Ok(())
}
