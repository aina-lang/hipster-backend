const Stripe = require('stripe');

// ⚠️ Mets ta vraie clé secrète ici
const stripe = new Stripe("sk_test_51SCdnjFhrfQ5vRxFew8tebrthJWj7rs7aR9gRcvBAPnAtEj2SjQcHhZCaUcy0APClppLMmW1xEpUNcWJqXJTuhiH00LRKoEPXg");


// async function resetStripeProducts() {
//   try {
//     const products = await stripe.products.list({ limit: 100 });

//     for (const product of products.data) {
//       console.log(`\n⚠️  Traitement du produit : ${product.name} (${product.id})`);

//       // Désactiver tous les prices
//       const prices = await stripe.prices.list({ product: product.id, limit: 100 });
//       for (const price of prices.data) {
//         await stripe.prices.update(price.id, { active: false });
//         console.log(`🗑️ Price désactivé : ${price.id}`);
//       }

//       // ⚠️ On ne supprime plus le produit
//       console.log(`ℹ️ Produit ${product.name} conservé (cannot delete user-created prices)`);
//     }

//     console.log('\n🎉 Tous les produits ont été “reset” en désactivant leurs prices.');
//   } catch (error) {
//     console.error('❌ Erreur :', error.message);
//   }
// }

// resetStripeProducts();

// async function deleteAllProductsAndPrices() {
//   try {
//     const products = await stripe.products.list({ limit: 100 });

//     for (const product of products.data) {
//       // 1️⃣ Supprimer tous les prices associés
//       const prices = await stripe.prices.list({ product: product.id, limit: 100 });
//       for (const price of prices.data) {
//         await stripe.prices.del(price.id);
//         console.log(`🗑️ Price supprimé : ${price.id} pour le produit ${product.name}`);
//       }

//       // 2️⃣ Supprimer le produit
//      await stripe.products.del(product.id);
//       console.log(`✅ Produit supprimé : ${product.name} (ID: ${product.id})`);
//     }

//     console.log('\n🎉 Tous les produits et prix ont été supprimés !');
//   } catch (error) {
//     console.error('❌ Erreur :', error.message);
//   }
// }

// deleteAllProductsAndPrices();

// async function deleteAllProducts() {
//   try {
//     // 1️⃣ Lister tous les produits
//     const products = await stripe.products.list({ limit: 100 });

//     if (products.data.length === 0) {
//       console.log('📦 Aucun produit trouvé.');
//       return;
//     }

//     console.log(`📦 ${products.data.length} produits trouvés, suppression en cours...\n`);

//     // 2️⃣ Supprimer chaque produit
//     for (const product of products.data) {
//       await stripe.products.del(product.id);
//       console.log(`✅ Produit supprimé : ${product.name} (ID: ${product.id})`);
//     }

//     console.log('\n🎉 Tous les produits ont été supprimés !');
//   } catch (error) {
//     console.error('❌ Erreur :', error.message);
//   }
// }

// // Lancer le script
// deleteAllProducts();
async function createProducts() {
  try {
    console.log('🚀 Création des produits...\n');

    // =========================
    // ATELIER EARLY (9.90€)
    // =========================
    const atelierEarlyProduct = await stripe.products.create({
      name: 'Atelier',
      description: 'Offre lancement 9,90€ pour les 30 premiers abonnés',
    });

    const atelierEarlyPrice = await stripe.prices.create({
      product: atelierEarlyProduct.id,
      unit_amount: 990,
      currency: 'eur',
      recurring: { interval: 'month' },
      lookup_key: 'atelier_early_monthly',
    });

    console.log('✅ Atelier Early créé');
    console.log('Product ID:', atelierEarlyProduct.id);
    console.log('Price ID:', atelierEarlyPrice.id);
    console.log('---------------------------');


    // =========================
    // ATELIER NORMAL (17.90€)
    // =========================
    const atelierNormalPrice = await stripe.prices.create({
      product: atelierEarlyProduct.id,
      unit_amount: 1790,
      currency: 'eur',
      recurring: { interval: 'month' },
      lookup_key: 'atelier_monthly',
    });

    console.log('✅ Atelier Normal créé');
    console.log('Price ID:', atelierNormalPrice.id);
    console.log('---------------------------');


    // =========================
    // STUDIO (29.90€)
    // =========================
    const studioProduct = await stripe.products.create({
      name: 'Studio',
      description: 'Orienté photo - optimisation HD / 4K',
    });

    const studioPrice = await stripe.prices.create({
      product: studioProduct.id,
      unit_amount: 2990,
      currency: 'eur',
      recurring: { interval: 'month' },
      lookup_key: 'studio_monthly',
    });

    console.log('✅ Studio créé');
    console.log('Product ID:', studioProduct.id);
    console.log('Price ID:', studioPrice.id);
    console.log('---------------------------');


    // =========================
    // AGENCE (69.99€)
    // =========================
    const agenceProduct = await stripe.products.create({
      name: 'Agence',
      description: 'Puissance maximale - vidéo, audio, 3D',
    });

    const agencePrice = await stripe.prices.create({
      product: agenceProduct.id,
      unit_amount: 6999,
      currency: 'eur',
      recurring: { interval: 'month' },
      lookup_key: 'agence_monthly',
    });

    console.log('✅ Agence créé');
    console.log('Product ID:', agenceProduct.id);
    console.log('Price ID:', agencePrice.id);
    console.log('---------------------------');

    console.log('\n🎉 Tous les produits sont créés avec succès !');
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

createProducts();

// async function listProducts() {
//   try {
//     const products = await stripe.products.list({
//       limit: 100,
//       expand: ['data.default_price'],
//     });

//     console.log('📦 Produits trouvés :\n');

//     for (const product of products.data) {
//       console.log('------------------------');
//       console.log('Nom:', product.name);
//       console.log('Product ID:', product.id);

//       if (product.default_price) {
//         console.log('Price ID:', product.default_price.id);
//         console.log(
//           'Prix:',
//           product.default_price.unit_amount / 100,
//           product.default_price.currency.toUpperCase()
//         );
//       }
//     }

//   } catch (error) {
//     console.error('❌ Erreur:', error.message);
//   }
// }

// listProducts();