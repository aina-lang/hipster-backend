const Stripe = require('stripe');
const fs = require('fs');
const stripeKey = "sk_test_51SwUCtIBocWEq1MHe0pWH7oueYNvY2ISgy5IwlQutozWeoNH7ezxdc1hJOM8fopuzp9DScLTxm0jGUig1BG5Zpxu009AeSrHAJ";
const stripe = new Stripe(stripeKey);

async function run() {
  let output = '';
  try {
    output += '--- FETCHING ALL PRODUCTS ---\n';
    const products = await stripe.products.list({ limit: 100 });
    products.data.forEach(p => output += `PRODUCT: ${p.id} | Name: ${p.name}\n`);

    output += '\n--- FETCHING ALL PRICES ---\n';
    const prices = await stripe.prices.list({ limit: 100 });
    prices.data.forEach(p => {
        output += `PRICE: ${p.id} | Product: ${p.product} | Amount: ${p.unit_amount/100} | Recurring: ${p.recurring ? p.recurring.interval : 'once-time'}\n`;
    });
  } catch (err) {
    output += `ERROR: ${err.message}\n`;
  }
  fs.writeFileSync('stripe_data.txt', output);
}

run();
