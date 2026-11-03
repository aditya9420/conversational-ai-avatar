-- ============================================================
-- Real-Time Conversational AI Avatar — MySQL Schema
-- ============================================================
CREATE DATABASE IF NOT EXISTS ai_avatar
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ai_avatar;

-- ------------------------------------------------------------
-- users: registered accounts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    user_id     CHAR(36)      NOT NULL PRIMARY KEY DEFAULT (UUID()),
    name        VARCHAR(150)  NOT NULL,
    email       VARCHAR(255)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- sessions: one row per conversation session with the avatar
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    session_id   CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
    user_id      CHAR(36)     NOT NULL,
    room_name    VARCHAR(150) NULL,          -- LiveKit room identifier
    status       ENUM('active','ended','error') NOT NULL DEFAULT 'active',
    started_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at     DATETIME     NULL,
    CONSTRAINT fk_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE,
    INDEX idx_sessions_user (user_id),
    INDEX idx_sessions_status (status)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- conversation_logs: every user/assistant turn in a session
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_logs (
    log_id       BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id   CHAR(36)     NOT NULL,
    role         ENUM('user','assistant','system') NOT NULL,
    message_text MEDIUMTEXT   NOT NULL,
    turn_index   INT          NOT NULL,       -- ordering within a session
    timestamp    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_logs_session
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        ON DELETE CASCADE,
    INDEX idx_logs_session (session_id),
    INDEX idx_logs_session_turn (session_id, turn_index)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- knowledge_base: reference content for RAG-style context
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_base (
    doc_id        CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
    title         VARCHAR(255) NOT NULL,
    content       LONGTEXT     NOT NULL,
    embedding_ref VARCHAR(255) NULL,   -- pointer to vector store id, if used
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FULLTEXT KEY ft_kb_content (title, content)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- system_metrics: per-turn latency/perf tracking
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_metrics (
    metric_id      BIGINT   NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id     CHAR(36) NOT NULL,
    log_id         BIGINT   NULL,             -- related conversation turn
    stt_latency_ms INT      NULL,
    llm_latency_ms INT      NULL,
    tts_latency_ms INT      NULL,
    total_latency_ms INT    NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_metrics_session
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_metrics_log
        FOREIGN KEY (log_id) REFERENCES conversation_logs(log_id)
        ON DELETE SET NULL,
    INDEX idx_metrics_session (session_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- api_usage: track Gemini API call volume/cost per session
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_usage (
    usage_id       BIGINT   NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id     CHAR(36) NOT NULL,
    provider       VARCHAR(50) NOT NULL DEFAULT 'gemini',
    model_name     VARCHAR(100) NOT NULL,
    prompt_tokens  INT NULL,
    completion_tokens INT NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_usage_session
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        ON DELETE CASCADE,
    INDEX idx_usage_session (session_id)
) ENGINE=InnoDB;
