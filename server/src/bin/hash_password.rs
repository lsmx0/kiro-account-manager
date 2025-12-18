// 密码哈希工具 - 用于生成 Argon2 密码哈希
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();
    
    if args.len() != 2 {
        eprintln!("用法: hash_password <密码>");
        eprintln!("示例: hash_password mypassword123");
        std::process::exit(1);
    }
    
    let password = &args[1];
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    
    match argon2.hash_password(password.as_bytes(), &salt) {
        Ok(hash) => {
            println!("密码哈希: {}", hash.to_string());
        }
        Err(e) => {
            eprintln!("哈希失败: {}", e);
            std::process::exit(1);
        }
    }
}
