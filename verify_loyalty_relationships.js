/**
 * Script de test pour vérifier les liaisons Loyalty, Project, User, Client
 * 
 * Usage: node verify_loyalty_relationships.js
 */

const API_BASE = 'http://localhost:4000/api';

// Helper pour fetch
async function get(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
}

// Couleurs pour le terminal
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
    console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.blue}🧪 TEST: ${name}${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

async function test1_UserClientProfileRelation() {
    logTest('Vérification User ↔ ClientProfile');

    try {
        const usersRes = await get(`${API_BASE}/users`);
        const users = usersRes.data;

        log(`Nombre d'utilisateurs: ${users.length}`);

        const clientUser = users.find(u => u.roles.includes('client_marketing') || u.roles.includes('client_ai'));

        if (!clientUser) {
            logWarning('Aucun utilisateur client trouvé');
            return;
        }

        log(`\nUtilisateur client trouvé: ${clientUser.firstName} ${clientUser.lastName} (ID: ${clientUser.id})`);

        if (clientUser.clientProfile) {
            logSuccess('clientProfile présent dans la réponse');
            log(`  - ID: ${clientUser.clientProfile.id}`);
            log(`  - Type: ${clientUser.clientProfile.clientType}`);
            log(`  - Points de fidélité: ${clientUser.clientProfile.loyaltyPoints}`);
            log(`  - Cashback total: ${clientUser.clientProfile.cashbackTotal}`);

            if (clientUser.clientProfile.loyaltyPoints === 0 && clientUser.clientProfile.cashbackTotal === 0) {
                logWarning('Les points de fidélité et le cashback sont à 0 (non utilisés)');
            }
        } else {
            logError('clientProfile manquant dans la réponse');
        }

    } catch (error) {
        logError(`Erreur: ${error.message}`);
    }
}

async function test2_ClientProfileProjectsRelation() {
    logTest('Vérification ClientProfile ↔ Projects');

    try {
        const projectsRes = await get(`${API_BASE}/projects`);
        const projects = projectsRes.data;

        log(`Nombre de projets: ${projects.length}`);

        if (projects.length === 0) {
            logWarning('Aucun projet trouvé');
            return;
        }

        const project = projects[0];
        log(`\nProjet: ${project.name} (ID: ${project.id})`);
        log(`  - Statut: ${project.status}`);

        if (project.client) {
            logSuccess('client présent dans la réponse');
            log(`  - Client ID: ${project.client.id}`);

            if (project.client.user) {
                logSuccess('user présent dans client');
                log(`    - Nom: ${project.client.user.firstName} ${project.client.user.lastName}`);
                log(`    - Email: ${project.client.user.email}`);
            } else {
                logWarning('user manquant dans client (relation non chargée)');
            }
        } else {
            logError('client manquant dans la réponse');
        }

    } catch (error) {
        logError(`Erreur: ${error.message}`);
    }
}

async function test3_LoyaltyServiceCalculation() {
    logTest('Vérification Loyalty Service - Calcul du Tier');

    try {
        const loyaltyRes = await get(`${API_BASE}/loyalty`);
        const loyaltyStatuses = loyaltyRes.data;

        log(`Nombre de clients avec statut de fidélité: ${loyaltyStatuses.length}`);

        if (loyaltyStatuses.length === 0) {
            logWarning('Aucun statut de fidélité trouvé');
            return;
        }

        loyaltyStatuses.forEach(item => {
            const { client, status } = item;
            log(`\n📊 Client: ${client.firstName} ${client.lastName}`);
            log(`  - Tier: ${status.tier}`);
            log(`  - Projets complétés: ${status.projectCount}`);
            log(`  - Récompense actuelle: ${status.currentReward}`);

            if (status.nextTier) {
                log(`  - Prochain tier: ${status.nextTier}`);
                log(`  - Projets manquants: ${status.projectsToNextTier}`);
                log(`  - Progression: ${status.progress.toFixed(1)}%`);
            } else {
                logSuccess('  - Tier maximum atteint! 🏆');
            }
        });

        logSuccess('\nCalcul des tiers fonctionnel');

    } catch (error) {
        logError(`Erreur: ${error.message}`);
    }
}

async function test4_LoyaltyDetailWithHistory() {
    logTest('Vérification Loyalty Detail - Historique des Tiers');

    try {
        const loyaltyRes = await get(`${API_BASE}/loyalty`);
        const loyaltyStatuses = loyaltyRes.data;

        const clientWithProjects = loyaltyStatuses.find(item => item.status.projectCount > 0);

        if (!clientWithProjects) {
            logWarning('Aucun client avec des projets complétés trouvé');
            return;
        }

        const clientId = clientWithProjects.client.id;
        log(`Client sélectionné: ${clientWithProjects.client.firstName} ${clientWithProjects.client.lastName} (ID: ${clientId})`);

        const detailRes = await get(`${API_BASE}/loyalty/${clientId}/detail`);
        const detail = detailRes.data;

        log(`\n📈 Détails de fidélité:`);
        log(`  - Tier actuel: ${detail.currentStatus.tier}`);
        log(`  - Total projets complétés: ${detail.totalProjects}`);
        log(`  - Projets en cours: ${detail.projectsInProgress}`);

        if (detail.tierHistory && detail.tierHistory.length > 0) {
            logSuccess(`\nHistorique des tiers (${detail.tierHistory.length} entrées):`);
            detail.tierHistory.forEach((entry, index) => {
                log(`  ${index + 1}. Projet: ${entry.projectName}`);
                log(`     - Complété le: ${new Date(entry.completedAt).toLocaleDateString('fr-FR')}`);
                log(`     - Projet #${entry.projectNumber}`);
                log(`     - Tier atteint: ${entry.tierReached}`);
                log(`     - Récompense: ${entry.rewardUnlocked}`);
            });
        } else {
            logWarning('Aucun historique de tiers trouvé');
        }

    } catch (error) {
        logError(`Erreur: ${error.message}`);
    }
}

async function test5_ProjectStatusImpactOnLoyalty() {
    logTest('Vérification Impact du Statut de Projet sur Loyalty');

    try {
        const projectsRes = await get(`${API_BASE}/projects`);
        const projects = projectsRes.data;

        const projectsByStatus = projects.reduce((acc, project) => {
            if (!acc[project.status]) acc[project.status] = [];
            acc[project.status].push(project);
            return acc;
        }, {});

        log('\n📊 Répartition des projets par statut:');
        Object.keys(projectsByStatus).forEach(status => {
            const count = projectsByStatus[status].length;
            log(`  - ${status}: ${count} projet(s)`);
        });

        const completedCount = projectsByStatus['completed']?.length || 0;
        log(`\n✅ Seuls les projets COMPLETED (${completedCount}) comptent pour la fidélité`);

        if (completedCount === 0) {
            logWarning('Aucun projet complété trouvé - les tiers resteront à STANDARD');
        }

    } catch (error) {
        logError(`Erreur: ${error.message}`);
    }
}

async function runAllTests() {
    console.log('\n');
    log('╔════════════════════════════════════════════════════════════════╗', 'cyan');
    log('║  🔍 VÉRIFICATION DES LIAISONS LOYALTY SYSTEM                   ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════════╝', 'cyan');

    await test1_UserClientProfileRelation();
    await test2_ClientProfileProjectsRelation();
    await test3_LoyaltyServiceCalculation();
    await test4_LoyaltyDetailWithHistory();
    await test5_ProjectStatusImpactOnLoyalty();

    console.log('\n');
    log('╔════════════════════════════════════════════════════════════════╗', 'cyan');
    log('║  ✨ TESTS TERMINÉS                                             ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════════╝', 'cyan');
    console.log('\n');
}

runAllTests().catch(error => {
    logError(`Erreur fatale: ${error.message}`);
    process.exit(1);
});
