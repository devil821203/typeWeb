ALTER TABLE articles ADD archived INTEGER NOT NULL DEFAULT 0;
GO
ALTER TABLE articles ADD CONSTRAINT articles_archived CHECK (archived IN (0,1));
