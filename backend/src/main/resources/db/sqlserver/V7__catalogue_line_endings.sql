-- Restore ZIP LF line endings after SQL script generation on Windows.
UPDATE articles SET content=REPLACE(content,NCHAR(13)+NCHAR(10),NCHAR(10)) WHERE id BETWEEN 1001 AND 1200;
