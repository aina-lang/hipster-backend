# Gestion des Permissions

## Vue d'ensemble

Ce module gère le système de permissions granulaire pour l'application. Les permissions sont organisées par module et action.

## Structure des permissions

Format: `module:action` ou `module:submodule:action`

Exemples:
- `users:create` - Créer un utilisateur
- `projects:update` - Modifier un projet
- `invoices:mark-paid` - Marquer une facture comme payée

## Génération des permissions par défaut

### Méthode 1: Via l'API (Recommandé)

```bash
POST http://localhost:4000/api/permissions/seed
```

Cette méthode crée toutes les permissions par défaut pour tous les modules existants.

### Méthode 2: Via la ligne de commande

```bash
npm run seed:permissions
```

## Modules couverts

Le script génère automatiquement les permissions pour:

1. **Users** - Gestion des utilisateurs
2. **Profiles** - Profils clients et employés
3. **Projects** - Gestion des projets
4. **Tasks** - Gestion des tâches
5. **Invoices** - Factures et devis
6. **Tickets** - Système de tickets
7. **Files** - Gestion des fichiers
8. **Campaigns** - Campagnes marketing
9. **Notifications** - Système de notifications
10. **Payments** - Gestion des paiements
11. **Subscriptions** - Abonnements
12. **Loyalty** - Programme de fidélité
13. **Referral** - Programme de parrainage
14. **Roles** - Gestion des rôles
15. **Permissions** - Gestion des permissions
16. **Chats** - Système de chat
17. **AI** - Fonctionnalités IA
18. **Company** - Informations entreprise
19. **Dashboard** - Tableau de bord
20. **System** - Administration système

## Actions standard par module

Pour chaque module, les permissions suivantes sont créées:

- `module:create` - Créer
- `module:read` - Lire/Voir
- `module:update` - Modifier
- `module:delete` - Supprimer
- `module:list` - Lister
- `module:manage` - Gérer complètement (optionnel)

## Permissions spéciales

Certains modules ont des permissions spécifiques:

- **Invoices**: `invoices:send`, `invoices:mark-paid`, `invoices:export`
- **Projects**: `projects:members:assign`, `projects:status:update`
- **Tasks**: `tasks:assign`, `tasks:status:update`
- **Loyalty**: `loyalty:points:add`, `loyalty:points:deduct`
- **AI**: `ai:use`, `ai:logs:read`, `ai:quota:manage`

## Utilisation

### Assigner des permissions à un utilisateur

```typescript
// Via l'API
POST /api/users/:id/access
{
  "permissionIds": [1, 2, 3, 4]
}
```

### Vérifier les permissions d'un utilisateur

```typescript
// Via l'API
GET /api/users/:id/access
```

## Notes importantes

- Le script est **idempotent**: il ne crée pas de doublons
- Les permissions existantes sont ignorées
- Le script peut être exécuté plusieurs fois sans problème
- Total: **~100+ permissions** générées automatiquement

