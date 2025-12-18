# ==================== 构建阶段 ====================
# 使用 latest 的 rust alpine 镜像
FROM rust:alpine AS builder

# 安装构建依赖
RUN apk add --no-cache musl-dev pkgconfig openssl-dev

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存
COPY Cargo.toml Cargo.lock* ./

# 创建虚拟 src 以缓存依赖
RUN mkdir -p src/bin && \
    echo "fn main() {}" > src/main.rs && \
    echo "fn main() {}" > src/bin/hash_password.rs
RUN cargo build --release && rm -rf src

# 复制实际源码
COPY src ./src

# 重新构建（只编译变更的代码）
RUN touch src/main.rs && cargo build --release

# ==================== 运行阶段 ====================
FROM alpine:latest

# 安装运行时依赖
RUN apk add --no-cache ca-certificates

WORKDIR /app

# 从构建阶段复制二进制文件
COPY --from=builder /app/target/release/kiro-sync-server /app/kiro-sync-server

# 创建非 root 用户
RUN adduser -D -u 1000 appuser
USER appuser

# 暴露端口
EXPOSE 8899

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8899/health || exit 1

# 启动服务
CMD ["./kiro-sync-server"]
