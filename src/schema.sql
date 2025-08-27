-- Cloudflare D1 Schema for a multi-tenant AI Agent SaaS

-- Drop tables if they exist to allow for easy schema changes in development
DROP TABLE IF EXISTS agents;
DROP TABLE IF EXISTS users;

-- Users table
-- Stores user account information, plan type, and agent limits
CREATE TABLE users (
    id TEXT PRIMARY KEY,                            -- Unique identifier for the user (e.g., UUID)
    username TEXT NOT NULL UNIQUE,                  -- User's chosen username, must be unique
    hashed_password TEXT NOT NULL,                  -- Password, securely hashed
    plan_type TEXT NOT NULL DEFAULT 'free',         -- 'free', 'paid', or 'admin'
    agent_count INTEGER NOT NULL DEFAULT 0,         -- Current number of agents created by the user
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Timestamp of account creation
);

-- Agents table
-- Stores information about each agent created by a user
CREATE TABLE agents (
    id TEXT PRIMARY KEY,                            -- Unique identifier for the agent (e.g., UUID)
    user_id TEXT NOT NULL,                          -- Foreign key linking to the users table
    name TEXT NOT NULL,                             -- A user-given name for the agent
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of agent creation
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes to improve query performance
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_agents_user_id ON agents(user_id);
