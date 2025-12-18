use jsonwebtoken::{decode, DecodingKey, Validation};

use crate::{error::AppError, models::Claims};

/// 从请求头提取并验证 JWT
pub fn extract_claims(
    auth_header: Option<&str>,
    jwt_secret: &str,
) -> Result<Claims, AppError> {
    let token = auth_header
        .and_then(|h| h.strip_prefix("Bearer "))
        .ok_or_else(|| AppError::Unauthorized("缺少 Authorization 头".into()))?;

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| AppError::Unauthorized(format!("Token 无效: {}", e)))?;

    Ok(token_data.claims)
}

/// 验证用户是否为管理员
pub fn require_admin(claims: &Claims) -> Result<(), AppError> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".into()));
    }
    Ok(())
}
