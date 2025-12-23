-- Migration: Add ClientWebsite table and remove old fields from ClientProfile
-- Date: 2025-12-01

-- ============================================
-- 1. Create client_websites table
-- ============================================
CREATE TABLE IF NOT EXISTS client_websites (
    id SERIAL PRIMARY KEY,
    url VARCHAR(500) NOT NULL,
    adminLogin VARCHAR(255) NOT NULL,
    adminPassword VARCHAR(255) NOT NULL,
    description TEXT,
    clientId INTEGER NOT NULL,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW(),
    
    -- Foreign key constraint
    CONSTRAINT fk_client_websites_client
        FOREIGN KEY (clientId) 
        REFERENCES client_profiles(id) 
        ON DELETE CASCADE
);

-- ============================================
-- 2. Migrate existing data (if any)
-- ============================================
-- This will copy any existing website management data 
-- from client_profiles to the new client_websites table
INSERT INTO client_websites (url, adminLogin, adminPassword, clientId, createdAt, updatedAt)
SELECT 
    managedWebsiteUrl, 
    websiteAdminLogin, 
    websiteAdminPassword, 
    id,
    NOW(),
    NOW()
FROM client_profiles
WHERE managedWebsiteUrl IS NOT NULL 
  AND managedWebsiteUrl != ''
  AND websiteAdminLogin IS NOT NULL
  AND websiteAdminPassword IS NOT NULL;

-- ============================================
-- 3. Remove old columns from client_profiles
-- ============================================
ALTER TABLE client_profiles 
DROP COLUMN IF EXISTS managedWebsiteUrl,
DROP COLUMN IF EXISTS websiteAdminLogin,
DROP COLUMN IF EXISTS websiteAdminPassword;

-- ============================================
-- 4. Create indexes for better performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_client_websites_clientId 
ON client_websites(clientId);

CREATE INDEX IF NOT EXISTS idx_client_websites_url 
ON client_websites(url);

-- ============================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================
-- To rollback this migration, run:
/*
-- 1. Add columns back to client_profiles
ALTER TABLE client_profiles 
ADD COLUMN managedWebsiteUrl VARCHAR(255),
ADD COLUMN websiteAdminLogin VARCHAR(255),
ADD COLUMN websiteAdminPassword VARCHAR(255);

-- 2. Migrate data back (only first website per client)
UPDATE client_profiles cp
SET 
    managedWebsiteUrl = cw.url,
    websiteAdminLogin = cw.adminLogin,
    websiteAdminPassword = cw.adminPassword
FROM (
    SELECT DISTINCT ON (clientId) 
        clientId, url, adminLogin, adminPassword
    FROM client_websites
    ORDER BY clientId, createdAt ASC
) cw
WHERE cp.id = cw.clientId;

-- 3. Drop client_websites table
DROP TABLE IF EXISTS client_websites CASCADE;
*/
