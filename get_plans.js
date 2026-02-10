const Stripe = require('stripe');
const fs = require('fs');
const stripeKey = "sk_test_51SwUCtIBocWEq1MHe0pWH7oueYNvY2ISgy5IwlQutozWeoNH7ezxdc1hJOM8fopuzp9DScLTxm0jGUig1BG5Zpxu009AeSrHAJ";
const stripe = new Stripe(stripeKey);

async function run() {
  let output = '';
  try {
    output += '--- PLANS ---\n';
    const plans = await stripe.plans.list({ limit: 100 });
    plans.data.forEach(p => output += `PLAN: ${p.id} | Amount: ${p.amount/100} | Interval: ${p.interval}\n`);

    output += '\n--- PRODUCTS ---\n';
    const products = await stripe.products.list({ limit: 100 });
    products.data.forEach(p => output += `PRODUCT: ${p.id} | Name: ${p.name}\n`);
  } catch (err) {
    output += `ERROR: ${err.message}\n`;
  }
  fs.writeFileSync('stripe_plans_products.txt', output);
}

run();
