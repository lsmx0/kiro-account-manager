// 邮局账号数据库管理
// 使用远程 MySQL 数据库

use crate::bt_mail::MailAccount;
use mysql_async::{prelude::*, Pool, Opts, OptsBuilder};
use serde::{Deserialize, Serialize};

// ==================== 数据库配置 ====================
// 与 auto_mail_mysql.py 保持一致
pub const DB_HOST: &str = "47.86.24.6";
pub const DB_PORT: u16 = 3306;
pub const DB_USER: &str = "root";
pub const DB_PASS: &str = "lsmx050320";
pub const DB_NAME: &str = "account";
pub const TABLE_NAME: &str = "account";

// ==================== 查询参数 ====================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QueryParams {
    pub id: Option<i32>,
    pub email: Option<String>,
    pub is_kiro: Option<i32>,
}

// ==================== 数据库管理器 ====================

pub struct MailDbManager {
    pool: Pool,
}

impl MailDbManager {
    pub fn new() -> Result<Self, String> {
        let opts = OptsBuilder::default()
            .ip_or_hostname(DB_HOST)
            .tcp_port(DB_PORT)
            .user(Some(DB_USER))
            .pass(Some(DB_PASS))
            .db_name(Some(DB_NAME));
        
        let pool = Pool::new(Opts::from(opts));
        
        Ok(Self { pool })
    }

    /// 检查邮箱是否存在
    pub async fn email_exists(&self, email: &str) -> Result<bool, String> {
        let mut conn = self.pool.get_conn().await
            .map_err(|e| format!("获取连接失败: {}", e))?;
        
        let sql = format!("SELECT id FROM {} WHERE email = ?", TABLE_NAME);
        let result: Option<i32> = conn.exec_first(&sql, (email,)).await
            .map_err(|e| format!("查询失败: {}", e))?;
        
        Ok(result.is_some())
    }

    /// 插入账号
    pub async fn insert_account(&self, email: &str, email_pawd: &str) -> Result<u64, String> {
        let mut conn = self.pool.get_conn().await
            .map_err(|e| format!("获取连接失败: {}", e))?;
        
        let sql = format!(
            "INSERT INTO {} (email, email_pawd, kiro_pawd, is_kiro) VALUES (?, ?, NULL, 0)",
            TABLE_NAME
        );
        
        conn.exec_drop(&sql, (email, email_pawd)).await
            .map_err(|e| format!("插入失败: {}", e))?;
        
        Ok(conn.last_insert_id().unwrap_or(0))
    }

    /// 删除账号 (按邮箱)
    pub async fn delete_by_email(&self, email: &str) -> Result<bool, String> {
        let mut conn = self.pool.get_conn().await
            .map_err(|e| format!("获取连接失败: {}", e))?;
        
        let sql = format!("DELETE FROM {} WHERE email = ?", TABLE_NAME);
        conn.exec_drop(&sql, (email,)).await
            .map_err(|e| format!("删除失败: {}", e))?;
        
        Ok(conn.affected_rows() > 0)
    }

    /// 删除账号 (按ID)
    #[allow(dead_code)]
    pub async fn delete_by_id(&self, id: i32) -> Result<bool, String> {
        let mut conn = self.pool.get_conn().await
            .map_err(|e| format!("获取连接失败: {}", e))?;
        
        let sql = format!("DELETE FROM {} WHERE id = ?", TABLE_NAME);
        conn.exec_drop(&sql, (id,)).await
            .map_err(|e| format!("删除失败: {}", e))?;
        
        Ok(conn.affected_rows() > 0)
    }

    /// 根据ID获取账号
    pub async fn get_by_id(&self, id: i32) -> Result<Option<MailAccount>, String> {
        let mut conn = self.pool.get_conn().await
            .map_err(|e| format!("获取连接失败: {}", e))?;
        
        let sql = format!(
            "SELECT id, email, email_pawd, kiro_pawd, is_kiro FROM {} WHERE id = ?",
            TABLE_NAME
        );
        
        let result: Option<(i32, String, String, Option<String>, Option<i32>)> = 
            conn.exec_first(&sql, (id,)).await
                .map_err(|e| format!("查询失败: {}", e))?;
        
        Ok(result.map(|(id, email, email_pawd, kiro_pawd, is_kiro)| MailAccount {
            id,
            email,
            email_pawd,
            kiro_pawd,
            is_kiro,
        }))
    }

    /// 根据邮箱获取账号
    pub async fn get_by_email(&self, email: &str) -> Result<Option<MailAccount>, String> {
        let mut conn = self.pool.get_conn().await
            .map_err(|e| format!("获取连接失败: {}", e))?;
        
        let sql = format!(
            "SELECT id, email, email_pawd, kiro_pawd, is_kiro FROM {} WHERE email = ?",
            TABLE_NAME
        );
        
        let result: Option<(i32, String, String, Option<String>, Option<i32>)> = 
            conn.exec_first(&sql, (email,)).await
                .map_err(|e| format!("查询失败: {}", e))?;
        
        Ok(result.map(|(id, email, email_pawd, kiro_pawd, is_kiro)| MailAccount {
            id,
            email,
            email_pawd,
            kiro_pawd,
            is_kiro,
        }))
    }

    /// 查询账号 (支持多条件)
    pub async fn query(&self, params: QueryParams) -> Result<Vec<MailAccount>, String> {
        let mut conn = self.pool.get_conn().await
            .map_err(|e| format!("获取连接失败: {}", e))?;
        
        let mut sql = format!(
            "SELECT id, email, email_pawd, kiro_pawd, is_kiro FROM {} WHERE 1=1",
            TABLE_NAME
        );
        let mut bind_params: Vec<mysql_async::Value> = Vec::new();
        
        if let Some(id) = params.id {
            sql.push_str(" AND id = ?");
            bind_params.push(id.into());
        }
        
        if let Some(ref email) = params.email {
            sql.push_str(" AND email LIKE ?");
            bind_params.push(format!("%{}%", email).into());
        }
        
        if let Some(is_kiro) = params.is_kiro {
            sql.push_str(" AND (is_kiro = ? OR (is_kiro IS NULL AND ? = 0))");
            bind_params.push(is_kiro.into());
            bind_params.push(is_kiro.into());
        }
        
        sql.push_str(" ORDER BY id DESC");
        
        let results: Vec<(i32, String, String, Option<String>, Option<i32>)> = 
            conn.exec(&sql, mysql_async::Params::Positional(bind_params)).await
                .map_err(|e| format!("查询失败: {}", e))?;
        
        Ok(results.into_iter().map(|(id, email, email_pawd, kiro_pawd, is_kiro)| MailAccount {
            id,
            email,
            email_pawd,
            kiro_pawd,
            is_kiro,
        }).collect())
    }

    /// 获取所有账号
    pub async fn get_all(&self) -> Result<Vec<MailAccount>, String> {
        self.query(QueryParams::default()).await
    }

    /// 获取未绑定 Kiro 的账号
    pub async fn get_non_kiro(&self) -> Result<Vec<MailAccount>, String> {
        self.query(QueryParams { is_kiro: Some(0), ..Default::default() }).await
    }

    /// 获取已绑定 Kiro 的账号
    pub async fn get_kiro_bound(&self) -> Result<Vec<MailAccount>, String> {
        self.query(QueryParams { is_kiro: Some(1), ..Default::default() }).await
    }

    /// 更新 Kiro 密码
    /// 同时会自动设置 is_kiro = 1（如果密码不为空）
    pub async fn update_kiro_password(&self, id: i32, kiro_pawd: &str) -> Result<bool, String> {
        let mut conn = self.pool.get_conn().await
            .map_err(|e| format!("获取连接失败: {}", e))?;
        
        // 如果密码不为空，同时设置 is_kiro = 1
        let is_kiro = if kiro_pawd.trim().is_empty() { 0 } else { 1 };
        
        let sql = format!(
            "UPDATE {} SET kiro_pawd = ?, is_kiro = ? WHERE id = ?",
            TABLE_NAME
        );
        
        conn.exec_drop(&sql, (kiro_pawd, is_kiro, id)).await
            .map_err(|e| format!("更新失败: {}", e))?;
        
        Ok(conn.affected_rows() > 0)
    }
}
