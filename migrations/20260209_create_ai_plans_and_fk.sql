-- Migration: create ai_plans table and add foreign key to ai_subscription_profiles

CREATE TABLE IF NOT EXISTS `ai_plans` (
  `id` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `stripe_price_id` varchar(255) DEFAULT NULL,
  `description` text,
  `features` json DEFAULT NULL,
  `popular` tinyint(1) DEFAULT 0,
  `active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default plans
INSERT INTO `ai_plans` (`id`,`name`,`price`,`stripe_price_id`,`description`,`features`,`popular`,`active`) VALUES
('curieux','Curieux',NULL,NULL,'7 jours gratuits pour essayer',JSON_ARRAY('2 textes / jour','2 images / jour','Pas d\u2019export','Accompagnement de l\'agence'),0,1),
('atelier','Atelier',9.90,'price_Atelier990','L\'essentiel pour cr\u00e9er',JSON_ARRAY('G\u00e9n\u00e9ration de texte','G\u00e9n\u00e9ration d\'image','Accompagnement de l\'agence'),0,1),
('studio','Studio',29.90,'price_Studio2990','Orient\u00e9 photo',JSON_ARRAY('G\u00e9n\u00e9ration de texte','G\u00e9n\u00e9ration d\'image','Optimisation image HD / 4K','Accompagnement de l\'agence'),1,1),
('agence','Agence',69.99,'price_Agence6990','Puissance maximale',JSON_ARRAY('G\u00e9n\u00e9ration de texte','G\u00e9n\u00e9ration d\'image','Optimisation image HD / 4K','Cr\u00e9ation vid\u00e9o','Cr\u00e9ation sonore','25 g\u00e9n\u00e9rations 3D/Sketch','Accompagnement de l\'agence'),0,1)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Add ai_plan_id column to subscription profiles and migrate existing planType values
ALTER TABLE `ai_subscription_profiles` ADD COLUMN IF NOT EXISTS `ai_plan_id` varchar(64) DEFAULT NULL;

-- Copy existing planType values (if present) to ai_plan_id
UPDATE `ai_subscription_profiles` SET `ai_plan_id` = `planType` WHERE `planType` IS NOT NULL;

-- Add foreign key
ALTER TABLE `ai_subscription_profiles` 
  ADD CONSTRAINT `fk_ai_plan` FOREIGN KEY (`ai_plan_id`) REFERENCES `ai_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Optionally drop the old planType enum column (COMMENTED OUT for safety)
-- ALTER TABLE `ai_subscription_profiles` DROP COLUMN `planType`;


COMMIT;
