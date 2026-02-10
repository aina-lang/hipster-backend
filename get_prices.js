const Stripe = require('stripe');
const stripeKey = "sk_test_51SwUCtIBocWEq1MHe0pWH7oueYNvY2ISgy5IwlQutozWeoNH7ezxdc1hJOM8fopuzp9DScLTxm0jGUig1BG5Zpxu009AeSrHAJ";
const stripe = new Stripe(stripeKey);

async function run() {
  try {
    console.log('--- FETCHING ALL PRODUCTS ---');
    const products = await stripe.products.list({ limit: 100 });
    products.data.forEach(p => console.log(`PRODUCT: ${p.id} | Name: ${p.name}`));

    console.log('\n--- FETCHING ALL PRICES ---');
    const prices = await stripe.prices.list({ limit: 100 });
    prices.data.forEach(p => {
        console.log(`PRICE: ${p.id} | Product: ${p.product} | Amount: ${p.unit_amount/100} | Recurring: ${p.recurring ? p.recurring.interval : 'once-time'}`);
    });
  } catch (err) {
    console.error('ERROR:', err);
  }
}

run();
