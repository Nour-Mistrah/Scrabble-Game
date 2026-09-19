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

-- 4. Create the game sessions table for room tracking
CREATE TABLE IF NOT EXISTS game_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id VARCHAR(50) NOT NULL UNIQUE,
  status ENUM('active', 'completed') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);