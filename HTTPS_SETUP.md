# Configuration HTTPS pour le Backend NestJS

## Problème

Votre frontend est servi en HTTPS (`https://www.hipster-ia.fr`) mais le backend utilise HTTP (`http://51.178.50.63`). Les navigateurs modernes bloquent les requêtes HTTP depuis des pages HTTPS (erreur "Mixed Content").

## Solutions

### Solution 1 : Utiliser un Reverse Proxy avec NGINX (Recommandé)

C'est la solution la plus simple et la plus sécurisée. NGINX gère le SSL/TLS et transmet les requêtes à votre application NestJS.

#### Étape 1 : Installer Certbot pour obtenir un certificat SSL gratuit

```bash
# Sur votre serveur 51.178.50.63
sudo apt update
sudo apt install certbot python3-certbot-nginx
```

#### Étape 2 : Obtenir un certificat SSL avec un domaine IP

Malheureusement, Let's Encrypt ne supporte pas les certificats pour les adresses IP directes. Vous avez deux options :

**Option A : Utiliser un certificat auto-signé (pour tests)**

```bash
# Créer un certificat auto-signé
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/nginx-selfsigned.key \
  -out /etc/ssl/certs/nginx-selfsigned.crt
```

**Option B : Utiliser un service de DNS gratuit (Recommandé)**

Utilisez un service comme **nip.io** ou **sslip.io** qui fournit des noms de domaine gratuits basés sur IP :

- Votre domaine serait : `51-178-50-63.nip.io` ou `51.178.50.63.nip.io`
- Puis obtenez un certificat Let's Encrypt pour ce domaine

```bash
sudo certbot --nginx -d 51-178-50-63.nip.io
```

#### Étape 3 : Configurer NGINX

Créez un fichier de configuration NGINX :

```bash
sudo nano /etc/nginx/sites-available/nestjs-api
```

Contenu du fichier :

```nginx
server {
    listen 80;
    server_name 51.178.50.63;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name 51.178.50.63;

    # Certificats SSL
    ssl_certificate /etc/ssl/certs/nginx-selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/nginx-selfsigned.key;

    # Configuration SSL recommandée
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;

    # Proxy vers NestJS
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket pour les notifications
    location /notifications/ {
        proxy_pass http://localhost:3000/notifications/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Servir les fichiers statiques (images, avatars, logos)
    location /uploads/ {
        alias /chemin/vers/vos/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

#### Étape 4 : Activer la configuration

```bash
sudo ln -s /etc/nginx/sites-available/nestjs-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Solution 2 : HTTPS directement dans NestJS

Si vous ne voulez pas utiliser NGINX, vous pouvez configurer HTTPS directement dans NestJS.

#### Étape 1 : Générer des certificats SSL

```bash
# Certificat auto-signé
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

#### Étape 2 : Modifier `main.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as fs from 'fs';
import * as https from 'https';

async function bootstrap() {
  const httpsOptions = {
    key: fs.readFileSync('./key.pem'),
    cert: fs.readFileSync('./cert.pem'),
  };

  const app = await NestFactory.create(AppModule, {
    httpsOptions,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  await app.listen(3000);
  console.log(`Application is running on: https://51.178.50.63:3000`);
}
bootstrap();
```

## Configuration Frontend

J'ai déjà mis à jour votre frontend pour utiliser HTTPS. Les fichiers modifiés :

1. **`lib/config.ts`** - Configuration centralisée des URLs
2. **`lib/api/axios.ts`** - Instance Axios avec HTTPS
3. **`lib/api/auth.ts`** - Endpoint de login avec HTTPS
4. **`lib/socket.ts`** - WebSocket avec HTTPS

### Variables d'environnement

Vous pouvez personnaliser les URLs via les variables d'environnement dans `.env.local` :

```env
NEXT_PUBLIC_API_URL=https://51.178.50.63/api/
NEXT_PUBLIC_STATIC_URL=https://51.178.50.63
NEXT_PUBLIC_SOCKET_URL=https://51.178.50.63/notifications
```

## Avertissement sur les Certificats Auto-signés

Si vous utilisez un certificat auto-signé, les navigateurs afficheront un avertissement de sécurité. Pour contourner cela en développement :

1. **Chrome/Edge** : Cliquez sur "Avancé" puis "Continuer vers le site"
2. **Firefox** : Cliquez sur "Avancé" puis "Accepter le risque et continuer"

Pour la production, utilisez toujours un certificat valide de Let's Encrypt ou d'une autre autorité de certification.

## Recommandation Finale

**Pour la production**, je recommande fortement :

1. Obtenir un nom de domaine gratuit ou payant pour votre backend
2. Utiliser Let's Encrypt pour un certificat SSL gratuit et valide
3. Configurer NGINX comme reverse proxy
4. Activer le renouvellement automatique des certificats

Exemple avec un domaine :

```bash
# Obtenir un domaine gratuit sur Freenom, No-IP, ou DuckDNS
# Pointer le domaine vers 51.178.50.63
# Obtenir un certificat SSL
sudo certbot --nginx -d api.votre-domaine.com
```

Cela éliminera tous les avertissements de sécurité et permettra à votre application de fonctionner correctement en production.
