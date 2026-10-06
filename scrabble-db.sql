-- 1. Create the database
CREATE DATABASE IF NOT EXISTS scrabble_db;

-- 2. Select the database
USE scrabble_db;

-- 3. Create the users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create the game sessions table for online multiplayer
CREATE TABLE IF NOT EXISTS game_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id VARCHAR(50) NOT NULL UNIQUE,
  status ENUM('active', 'completed') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  host_user_id INT NOT NULL,
  required_players INT NOT NULL DEFAULT 2,
  game_state JSON NULL,
  state_version INT NOT NULL DEFAULT 0,
  game_code VARCHAR(8) NULL UNIQUE
);

-- 5. Create the game players table
CREATE TABLE IF NOT EXISTS game_players (
  id INT AUTO_INCREMENT PRIMARY KEY,
  game_session_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);