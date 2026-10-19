CREATE TABLE members (
 id BIGINT IDENTITY(1,1) PRIMARY KEY,
 email NVARCHAR(254) NOT NULL UNIQUE,
 password_hash NVARCHAR(100) NOT NULL,
 birthday DATE NOT NULL,
 phone NVARCHAR(30) NOT NULL,
 name NVARCHAR(80) NOT NULL,
 nickname NVARCHAR(80) NOT NULL
);
CREATE TABLE courses (id BIGINT PRIMARY KEY, title NVARCHAR(100) NOT NULL, description NVARCHAR(500) NOT NULL);
CREATE TABLE articles (
 id BIGINT PRIMARY KEY, course_id BIGINT NOT NULL REFERENCES courses(id),
 title NVARCHAR(100) NOT NULL, content NVARCHAR(MAX) NOT NULL, members_only BIT NOT NULL
);
CREATE TABLE attempts (
 id BIGINT IDENTITY(1,1) PRIMARY KEY,
 member_id BIGINT NOT NULL REFERENCES members(id), article_id BIGINT NOT NULL REFERENCES articles(id),
 content_snapshot NVARCHAR(MAX) NOT NULL, started_at DATETIMEOFFSET NOT NULL,
 finished_at DATETIMEOFFSET, elapsed_ms BIGINT, typed_text NVARCHAR(MAX),
 correct_chars INTEGER, cpm FLOAT, wpm FLOAT, accuracy FLOAT,
 status NVARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS'
);
CREATE INDEX attempts_member_started ON attempts(member_id, started_at DESC);
