ALTER TABLE articles ADD difficulty VARCHAR(20) NOT NULL DEFAULT 'beginner';
ALTER TABLE articles ADD CONSTRAINT articles_difficulty CHECK (difficulty IN ('beginner','intermediate','advanced'));
UPDATE articles SET difficulty=CASE course_id WHEN 2 THEN 'intermediate' WHEN 3 THEN 'advanced' ELSE 'beginner' END;
