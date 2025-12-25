// 宝塔邮局用户管理命令
// 遵循: 先 API 操作，后数据库同步

use crate::bt_mail::{
    BtMailClient, BatchCreateResult, CreateUserResult, DeleteResult, MailAccount,
    generate_strong_password, generate_username, MAIL_DOMAIN,
};
use crate::mail_db::{MailDbManager, QueryParams};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::State;

// ==================== 状态管理 ====================

pub struct MailState {
    pub db: Arc<Mutex<MailDbManager>>,
}

impl MailState {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            db: Arc::new(Mutex::new(MailDbManager::new()?)),
        })
    }
}

// ==================== 新增用户 ====================

/// 批量创建邮箱账户
/// 流程: 生成用户名密码 -> 调用 API 创建 -> 成功后写入数据库
#[tauri::command]
pub async fn mail_create_users(
    state: State<'_, MailState>,
    count: i32,
) -> Result<BatchCreateResult, String> {
    if count <= 0 || count > 100 {
        return Err("数量必须在 1-100 之间".to_string());
    }

    let api = BtMailClient::new();
    let mut result = BatchCreateResult {
        success_count: 0,
        fail_count: 0,
        created_accounts: Vec::new(),
        errors: Vec::new(),
    };

    for i in 1..=count {
        let username_prefix = generate_username(5);
        let password = generate_strong_password(12);
        let full_email = format!("{}@{}", username_prefix, MAIL_DOMAIN);

        println!("[{}/{}] 创建邮箱: {}", i, count, full_email);

        // 检查数据库是否已存在
        {
            let db = state.db.lock().await;
            if db.email_exists(&full_email).await.unwrap_or(false) {
                let msg = format!("{} 数据库中已存在", full_email);
                println!("  [跳过] {}", msg);
                result.errors.push(msg);
                result.fail_count += 1;
                continue;
            }
        }

        // 步骤1: 调用 API 创建邮箱
        let api_result = api.create_user(&username_prefix, &password).await;

        match api_result {
            Ok(res) if res.status => {
                // API 成功，步骤2: 写入数据库
                let db = state.db.lock().await;
                match db.insert_account(&full_email, &password).await {
                    Ok(_) => {
                        println!("  [成功] 已入库");
                        result.success_count += 1;
                        result.created_accounts.push(CreateUserResult {
                            success: true,
                            email: full_email,
                            password,
                            message: "创建成功".to_string(),
                        });
                    }
                    Err(e) => {
                        // API 成功但数据库失败 - 严重问题
                        let msg = format!("{} API成功但数据库写入失败: {}", full_email, e);
                        println!("  [错误] {}", msg);
                        result.errors.push(msg);
                        result.fail_count += 1;
                    }
                }
            }
            Ok(res) if res.is_exists_error => {
                // 邮箱已存在于邮局，尝试补录数据库
                println!("  [警告] 邮局已存在，尝试补录数据库");
                let db = state.db.lock().await;
                match db.insert_account(&full_email, &password).await {
                    Ok(_) => {
                        println!("  [成功] 已补录");
                        result.success_count += 1;
                        result.created_accounts.push(CreateUserResult {
                            success: true,
                            email: full_email,
                            password,
                            message: "邮局已存在，已补录数据库".to_string(),
                        });
                    }
                    Err(e) => {
                        let msg = format!("{} 补录失败: {}", full_email, e);
                        result.errors.push(msg);
                        result.fail_count += 1;
                    }
                }
            }
            Ok(res) => {
                // API 失败
                let msg = format!("{} API创建失败: {}", full_email, res.msg);
                println!("  [失败] {}", msg);
                result.errors.push(msg);
                result.fail_count += 1;
            }
            Err(e) => {
                let msg = format!("{} 请求异常: {}", full_email, e);
                println!("  [异常] {}", msg);
                result.errors.push(msg);
                result.fail_count += 1;
            }
        }
    }

    println!(
        "批量创建完成: 成功 {}, 失败 {}",
        result.success_count, result.fail_count
    );

    Ok(result)
}

// ==================== 删除用户 ====================

/// 删除邮箱账户 (按邮箱或ID)
/// 流程: 查找账号 -> 调用 API 删除邮局账户 -> 成功后删除数据库记录
#[tauri::command]
pub async fn mail_delete_user(
    state: State<'_, MailState>,
    email: Option<String>,
    id: Option<i32>,
) -> Result<DeleteResult, String> {
    println!("[mail_delete_user] 开始删除，email={:?}, id={:?}", email, id);
    
    // 确定要删除的邮箱
    let target_email = if let Some(e) = email {
        e
    } else if let Some(account_id) = id {
        let db = state.db.lock().await;
        match db.get_by_id(account_id).await? {
            Some(acc) => acc.email,
            None => {
                println!("[mail_delete_user] 未找到 ID 为 {} 的账号", account_id);
                return Ok(DeleteResult {
                    success: false,
                    message: format!("未找到 ID 为 {} 的账号", account_id),
                    deleted_email: None,
                });
            }
        }
    } else {
        return Err("请提供邮箱地址或账号ID".to_string());
    };

    println!("[mail_delete_user] 目标邮箱: {}", target_email);

    // 检查数据库中是否存在
    {
        let db = state.db.lock().await;
        if db.get_by_email(&target_email).await?.is_none() {
            println!("[mail_delete_user] 数据库中未找到账户: {}", target_email);
            return Ok(DeleteResult {
                success: false,
                message: format!("数据库中未找到账户: {}", target_email),
                deleted_email: None,
            });
        }
    }

    // 步骤1: 调用宝塔 API 删除邮局账户
    println!("[mail_delete_user] 步骤1: 调用宝塔 API 删除邮局账户...");
    let api = BtMailClient::new();
    let api_result = api.delete_user(&target_email).await;
    println!("[mail_delete_user] API 返回结果: {:?}", api_result);

    match api_result {
        Ok(res) if res.status => {
            // API 成功，步骤2: 删除数据库记录
            println!("[mail_delete_user] 步骤2: API 删除成功，删除数据库记录...");
            let db = state.db.lock().await;
            match db.delete_by_email(&target_email).await {
                Ok(true) => {
                    println!("[mail_delete_user] 删除完成: {}", target_email);
                    Ok(DeleteResult {
                        success: true,
                        message: format!("账户 {} 删除成功（邮局+数据库）", target_email),
                        deleted_email: Some(target_email),
                    })
                }
                Ok(false) => {
                    println!("[mail_delete_user] API删除成功但数据库中未找到记录");
                    Ok(DeleteResult {
                        success: false,
                        message: format!("API删除成功但数据库中未找到记录: {}", target_email),
                        deleted_email: None,
                    })
                }
                Err(e) => {
                    println!("[mail_delete_user] API删除成功但数据库删除失败: {}", e);
                    Ok(DeleteResult {
                        success: false,
                        message: format!("API删除成功但数据库删除失败: {}", e),
                        deleted_email: None,
                    })
                }
            }
        }
        Ok(res) => {
            // API 失败 - 检查是否为"不存在"错误
            println!("[mail_delete_user] API 返回失败: {}", res.msg);
            let msg_lower = res.msg.to_lowercase();
            if msg_lower.contains("not exist") || res.msg.contains("不存在") {
                // 邮局中不存在，清理数据库记录
                println!("[mail_delete_user] 邮局中不存在，清理数据库记录");
                let db = state.db.lock().await;
                let _ = db.delete_by_email(&target_email).await;
                Ok(DeleteResult {
                    success: true,
                    message: format!("邮局中不存在，已清理数据库记录: {}", target_email),
                    deleted_email: Some(target_email),
                })
            } else {
                Ok(DeleteResult {
                    success: false,
                    message: format!("API删除失败: {}", res.msg),
                    deleted_email: None,
                })
            }
        }
        Err(e) => {
            println!("[mail_delete_user] API 请求异常: {}", e);
            Ok(DeleteResult {
                success: false,
                message: format!("请求异常: {}", e),
                deleted_email: None,
            })
        }
    }
}

// ==================== 查询用户 ====================

/// 查询邮箱账户
#[tauri::command]
pub async fn mail_query_users(
    state: State<'_, MailState>,
    id: Option<i32>,
    email: Option<String>,
    is_kiro: Option<i32>,
) -> Result<Vec<MailAccount>, String> {
    let db = state.db.lock().await;
    db.query(QueryParams { id, email, is_kiro }).await
}

/// 获取所有邮箱账户
#[tauri::command]
pub async fn mail_get_all_users(state: State<'_, MailState>) -> Result<Vec<MailAccount>, String> {
    let db = state.db.lock().await;
    db.get_all().await
}

/// 获取未绑定 Kiro 的账户
#[tauri::command]
pub async fn mail_get_non_kiro_users(state: State<'_, MailState>) -> Result<Vec<MailAccount>, String> {
    let db = state.db.lock().await;
    db.get_non_kiro().await
}

/// 获取已绑定 Kiro 的账户
#[tauri::command]
pub async fn mail_get_kiro_users(state: State<'_, MailState>) -> Result<Vec<MailAccount>, String> {
    let db = state.db.lock().await;
    db.get_kiro_bound().await
}

/// 根据ID获取单个账户
#[tauri::command]
pub async fn mail_get_user_by_id(
    state: State<'_, MailState>,
    id: i32,
) -> Result<Option<MailAccount>, String> {
    let db = state.db.lock().await;
    db.get_by_id(id).await
}

/// 根据邮箱获取单个账户
#[tauri::command]
pub async fn mail_get_user_by_email(
    state: State<'_, MailState>,
    email: String,
) -> Result<Option<MailAccount>, String> {
    let db = state.db.lock().await;
    db.get_by_email(&email).await
}

// ==================== 获取验证码 ====================

/// 获取邮箱验证码
/// 从收件箱获取最新邮件并解析验证码
#[tauri::command]
pub async fn mail_get_verification_code(
    email: String,
) -> Result<crate::bt_mail::GetCodeResult, String> {
    use crate::bt_mail::{BtMailClient, GetCodeResult, extract_verification_code};
    
    println!("获取验证码: {}", email);
    
    let api = BtMailClient::new();
    
    // 获取收件箱
    match api.get_mails(&email).await {
        Ok(response) => {
            // 检查外层状态
            if !response.status {
                return Ok(GetCodeResult {
                    success: false,
                    code: None,
                    message: format!("API 错误: {}", response.msg),
                });
            }
            
            // 获取内层数据
            let inner_data = match response.data {
                Some(d) => d,
                None => {
                    return Ok(GetCodeResult {
                        success: false,
                        code: None,
                        message: "响应数据为空".to_string(),
                    });
                }
            };
            
            if inner_data.data.is_empty() {
                return Ok(GetCodeResult {
                    success: false,
                    code: None,
                    message: "收件箱为空".to_string(),
                });
            }
            
            // 获取最新一封邮件
            let latest_mail = &inner_data.data[0];
            println!("  最新邮件主题: {:?}", latest_mail.subject);
            
            // 尝试从多个来源获取邮件内容
            // 优先级: body > html > text (html 比 text 更干净，text 包含邮件头)
            let mut content = String::new();
            
            // 1. 首先尝试 body 字段
            if let Some(body) = &latest_mail.body {
                if !body.is_empty() {
                    content = body.clone();
                    println!("  [调试] 从 body 字段获取内容，长度: {}", content.len());
                }
            }
            
            // 2. 如果 body 为空，尝试从 extra 中获取 html 或其他字段
            if content.is_empty() {
                if let Some(extra) = &latest_mail.extra {
                    // 优先使用 html 字段（更干净），然后是其他字段
                    let possible_fields = ["html", "body", "content", "text", "message", "plain"];
                    for field in possible_fields {
                        if let Some(val) = extra.get(field) {
                            if let Some(s) = val.as_str() {
                                if !s.is_empty() {
                                    content = s.to_string();
                                    println!("  [调试] 从 extra.{} 获取内容，长度: {}", field, content.len());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            
            if !content.is_empty() {
                // 打印内容用于调试
                println!("  邮件内容长度: {} 字符", content.len());
                println!("  邮件内容前2000字符:\n{}", &content[..content.len().min(2000)]);
                
                // 解析验证码
                if let Some(code) = extract_verification_code(&content) {
                    println!("  [成功] 验证码: {}", code);
                    return Ok(GetCodeResult {
                        success: true,
                        code: Some(code),
                        message: "获取成功".to_string(),
                    });
                } else {
                    println!("  [调试] 未能从内容中提取验证码");
                }
            } else {
                println!("  [调试] 邮件内容为空，可能需要单独获取邮件详情");
                // 打印完整的邮件对象用于调试
                if let Some(extra) = &latest_mail.extra {
                    println!("  [调试] 完整邮件数据: {}", 
                        serde_json::to_string_pretty(extra).unwrap_or_default());
                }
            }
            
            Ok(GetCodeResult {
                success: false,
                code: None,
                message: "未找到验证码，邮件内容可能为空".to_string(),
            })
        }
        Err(e) => {
            println!("  [失败] {}", e);
            Ok(GetCodeResult {
                success: false,
                code: None,
                message: format!("获取邮件失败: {}", e),
            })
        }
    }
}

// ==================== 更新 Kiro 密码 ====================

/// 更新邮箱账户的 Kiro 密码
#[tauri::command]
pub async fn mail_update_kiro_password(
    state: State<'_, MailState>,
    id: i32,
    kiro_pawd: String,
) -> Result<bool, String> {
    let db = state.db.lock().await;
    db.update_kiro_password(id, &kiro_pawd).await
}
