// 宝塔邮局 API 客户端
// API 接口分析：
// - 认证方式: request_time (时间戳) + request_token (MD5签名)
// - 签名算法: MD5(时间戳 + MD5(API_KEY))
// - 请求格式: POST application/x-www-form-urlencoded
// - 响应格式: JSON { status: bool, msg: string }

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

// ==================== 配置 ====================
pub const BT_PANEL_URL: &str = "http://47.86.24.6:8888";
pub const BT_API_KEY: &str = "xq7JpzqZ1OCYPj5nAnMJtuwshoC8gqHi";
pub const MAIL_DOMAIN: &str = "suhengdashuaibi.xyz";
pub const DEFAULT_QUOTA: i32 = 5; // MB

// ==================== 数据结构 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BtApiResponse {
    pub status: bool,
    #[serde(default)]
    pub msg: String,
    #[serde(default)]
    pub is_exists_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailAccount {
    pub id: i32,
    pub email: String,
    pub email_pawd: String,
    #[serde(default)]
    pub kiro_pawd: Option<String>,
    #[serde(default)]
    pub is_kiro: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserResult {
    pub success: bool,
    pub email: String,
    pub password: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCreateResult {
    pub success_count: i32,
    pub fail_count: i32,
    pub created_accounts: Vec<CreateUserResult>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResult {
    pub success: bool,
    pub message: String,
    pub deleted_email: Option<String>,
}

// 获取邮件响应 - 外层结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetMailsResponse {
    #[serde(default)]
    pub code: i32,
    #[serde(default)]
    pub status: bool,
    #[serde(default)]
    pub msg: String,
    #[serde(default)]
    pub data: Option<GetMailsInnerData>,
}

// 获取邮件响应 - 内层 data 结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetMailsInnerData {
    #[serde(default)]
    pub status: bool,
    #[serde(default)]
    pub data: Vec<MailItem>,
    #[serde(default)]
    pub page: Option<PageInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailItem {
    #[serde(default)]
    pub id: Option<i64>,
    #[serde(default)]
    pub subject: Option<String>,
    #[serde(default, alias = "from_addr")]
    pub from: Option<String>,
    #[serde(default, alias = "to_addr")]
    pub to: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub date: Option<String>,
    // 允许其他未知字段
    #[serde(flatten)]
    pub extra: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageInfo {
    #[serde(default)]
    pub count: i32,
    #[serde(default)]
    pub p: i32,
}

// 获取验证码结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCodeResult {
    pub success: bool,
    pub code: Option<String>,
    pub message: String,
}

// ==================== 宝塔 API 客户端 ====================

pub struct BtMailClient {
    url: String,
    key: String,
    client: reqwest::Client,
}

impl BtMailClient {
    pub fn new() -> Self {
        Self {
            url: BT_PANEL_URL.trim_end_matches('/').to_string(),
            key: BT_API_KEY.to_string(),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .danger_accept_invalid_certs(true)
                .build()
                .unwrap(),
        }
    }

    /// 生成 API 签名
    /// 算法: MD5(时间戳 + MD5(API_KEY))
    fn get_signature(&self) -> (i64, String) {
        let now_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        
        // MD5(API_KEY)
        let md5_key = format!("{:x}", md5::compute(self.key.as_bytes()));
        
        // MD5(时间戳 + MD5(API_KEY))
        let sign_str = format!("{}{}", now_time, md5_key);
        let signature = format!("{:x}", md5::compute(sign_str.as_bytes()));
        
        (now_time, signature)
    }

    /// 创建邮箱用户
    pub async fn create_user(&self, username_prefix: &str, password: &str) -> Result<BtApiResponse, String> {
        let (request_time, signature) = self.get_signature();
        let full_email = format!("{}@{}", username_prefix, MAIL_DOMAIN);
        let quota_str = format!("{} MB", DEFAULT_QUOTA);
        
        let api_url = format!("{}/plugin?action=a&name=mail_sys&s=add_mailbox", self.url);
        
        let mut params = HashMap::new();
        params.insert("request_time", request_time.to_string());
        params.insert("request_token", signature);
        params.insert("username", full_email.clone());
        params.insert("domain", MAIL_DOMAIN.to_string());
        params.insert("password", password.to_string());
        params.insert("full_name", username_prefix.to_string());
        params.insert("quota", quota_str);
        params.insert("is_admin", "0".to_string());
        
        let response = self.client
            .post(&api_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0")
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;
        
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        
        if !status.is_success() {
            return Err(format!("HTTP Error {}: {}", status, &text[..text.len().min(200)]));
        }
        
        let mut result: BtApiResponse = serde_json::from_str(&text)
            .map_err(|_| format!("JSON解析失败: {}", &text[..text.len().min(100)]))?;
        
        // 检查是否为"已存在"错误
        if !result.status {
            let msg_lower = result.msg.to_lowercase();
            if msg_lower.contains("exist") || result.msg.contains("已存在") {
                result.is_exists_error = true;
            }
        }
        
        Ok(result)
    }

    /// 获取邮箱收件箱
    /// API: /mail_sys/get_mails.json
    pub async fn get_mails(&self, email: &str) -> Result<GetMailsResponse, String> {
        let (request_time, signature) = self.get_signature();
        
        let api_url = format!("{}/mail_sys/get_mails.json", self.url);
        
        let mut params = HashMap::new();
        params.insert("request_time", request_time.to_string());
        params.insert("request_token", signature);
        params.insert("p", "1".to_string());
        params.insert("username", email.to_string());
        
        let response = self.client
            .post(&api_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0")
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;
        
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        
        if !status.is_success() {
            return Err(format!("HTTP Error {}: {}", status, &text[..text.len().min(200)]));
        }
        
        // 先用 Value 解析，更灵活
        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("JSON解析失败: {}", e))?;
        
        // 手动提取数据
        let outer_status = json.get("status").and_then(|v| v.as_bool()).unwrap_or(false);
        let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("").to_string();
        
        let inner_data = if let Some(data) = json.get("data") {
            let inner_status = data.get("status").and_then(|v| v.as_bool()).unwrap_or(false);
            let mails = data.get("data").and_then(|v| v.as_array()).map(|arr| {
                arr.iter().filter_map(|item| {
                    // 尝试多个可能的字段名获取邮件内容
                    let body = item.get("body")
                        .or_else(|| item.get("content"))
                        .or_else(|| item.get("text"))
                        .or_else(|| item.get("html"))
                        .or_else(|| item.get("message"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    
                    Some(MailItem {
                        id: item.get("id").and_then(|v| v.as_i64()),
                        subject: item.get("subject").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        from: item.get("from").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        to: item.get("to").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        body,
                        date: item.get("date").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        extra: Some(item.clone()),
                    })
                }).collect()
            }).unwrap_or_default();
            
            Some(GetMailsInnerData {
                status: inner_status,
                data: mails,
                page: None,
            })
        } else {
            None
        };
        
        Ok(GetMailsResponse {
            code: json.get("code").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            status: outer_status,
            msg,
            data: inner_data,
        })
    }

    /// 删除邮箱用户
    /// API: /mail_sys/delete_mailbox.json
    pub async fn delete_user(&self, email: &str) -> Result<BtApiResponse, String> {
        let (request_time, signature) = self.get_signature();
        
        // 使用正确的 API 路径
        let api_url = format!("{}/mail_sys/delete_mailbox.json", self.url);
        
        let mut params = HashMap::new();
        params.insert("request_time", request_time.to_string());
        params.insert("request_token", signature);
        params.insert("username", email.to_string());
        
        let response = self.client
            .post(&api_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0")
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;
        
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        
        if !status.is_success() {
            return Err(format!("HTTP Error {}", status));
        }
        
        serde_json::from_str(&text)
            .map_err(|_| format!("JSON解析失败: {}", &text[..text.len().min(100)]))
    }
}

// ==================== 工具函数 ====================

/// 生成强密码: 大写+小写+数字+特殊字符
pub fn generate_strong_password(length: usize) -> String {
    use rand::Rng;
    
    let length = if length < 8 { 8 } else { length };
    let mut rng = rand::thread_rng();
    
    let upper: Vec<char> = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".chars().collect();
    let lower: Vec<char> = "abcdefghijklmnopqrstuvwxyz".chars().collect();
    let digits: Vec<char> = "0123456789".chars().collect();
    let special: Vec<char> = "!@#%&*?".chars().collect();
    let all: Vec<char> = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#%&*?".chars().collect();
    
    let mut pwd = Vec::new();
    pwd.push(upper[rng.gen_range(0..upper.len())]);
    pwd.push(lower[rng.gen_range(0..lower.len())]);
    pwd.push(digits[rng.gen_range(0..digits.len())]);
    pwd.push(special[rng.gen_range(0..special.len())]);
    
    for _ in 0..(length - 4) {
        pwd.push(all[rng.gen_range(0..all.len())]);
    }
    
    // 打乱顺序
    use rand::seq::SliceRandom;
    pwd.shuffle(&mut rng);
    
    pwd.into_iter().collect()
}

/// 生成用户名: 小写字母+数字
pub fn generate_username(length: usize) -> String {
    use rand::Rng;
    
    let chars: Vec<char> = "abcdefghijklmnopqrstuvwxyz0123456789".chars().collect();
    let mut rng = rand::thread_rng();
    
    (0..length)
        .map(|_| chars[rng.gen_range(0..chars.len())])
        .collect()
}

/// 从邮件内容中提取验证码
/// 支持纯文本和 HTML 格式
pub fn extract_verification_code(content: &str) -> Option<String> {
    use regex::Regex;
    
    // 方法1: 匹配 "验证码：: 123456" 或 "验证码: 123456" 格式（纯文本）
    let cn_code_re = Regex::new(r"验证码[：:]+\s*(\d{4,8})").ok()?;
    if let Some(caps) = cn_code_re.captures(content) {
        return caps.get(1).map(|m| m.as_str().to_string());
    }
    
    // 方法2: 匹配 "verification code: 123456" 格式
    let en_code_re = Regex::new(r"(?i)verification\s*code[:\s]+(\d{4,8})").ok()?;
    if let Some(caps) = en_code_re.captures(content) {
        return caps.get(1).map(|m| m.as_str().to_string());
    }
    
    // 方法3: 查找 class="code" 的 div（HTML 格式）
    let code_div_re = Regex::new(r#"<div[^>]*class="code"[^>]*>(\d{4,8})</div>"#).ok()?;
    if let Some(caps) = code_div_re.captures(content) {
        return caps.get(1).map(|m| m.as_str().to_string());
    }
    
    // 方法4: 查找 HTML 中的验证码
    let html_code_re = Regex::new(r#"(?:code|验证码)[^>]*>[\s]*(\d{4,8})[\s]*<"#).ok()?;
    if let Some(caps) = html_code_re.captures(content) {
        return caps.get(1).map(|m| m.as_str().to_string());
    }
    
    // 方法5: 查找独立的 6 位数字（最后手段）
    let simple_re = Regex::new(r"(?:^|\s)(\d{6})(?:\s|$)").ok()?;
    if let Some(caps) = simple_re.captures(content) {
        return caps.get(1).map(|m| m.as_str().to_string());
    }
    
    None
}
