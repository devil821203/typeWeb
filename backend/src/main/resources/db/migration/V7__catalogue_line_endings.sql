-- Restore ZIP LF line endings after SQL script generation on Windows.
UPDATE articles SET content=REPLACE(content,CHR(13)||CHR(10),CHR(10)) WHERE id BETWEEN 1001 AND 1200;
