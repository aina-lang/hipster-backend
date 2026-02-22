-- Add conversationId column to ai_generations table
ALTER TABLE ai_generations 
ADD COLUMN conversationId VARCHAR(255) NULLABLE;

-- Create index on conversationId for faster queries
CREATE INDEX idx_ai_generations_conversationId 
ON ai_generations(conversationId);

-- Create composite index for user + conversationId
CREATE INDEX idx_ai_generations_user_conversationId 
ON ai_generations(userId, conversationId);
