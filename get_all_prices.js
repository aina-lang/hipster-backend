const Stripe = require('stripe');
const fs = require('fs');
const stripeKey = "sk_test_51SwUCtIBocWEq1MHe0pWH7oueYNvY2ISgy5IwlQutozWeoNH7ezxdc1hJOM8fopuzp9DScLTxm0jGUig1BG5Zpxu009AeSrHAJ";
const stripe = new Stripe(stripeKey);

async function run() {
  let output = '';
  try {
    const prices = await stripe.prices.list({ limit: 100 }); // active: true is default
    output += `Found ${prices.data.length} active prices\n`;
    
    const allPrices = await stripe.prices.list({ limit: 100, active: false });
    output += `Found ${allPrices.data.length} inactive prices\n`;

    prices.data.concat(allPrices.data).forEach(p => {
        output += `PRICE: ${p.id} | Amount: ${p.unit_amount/100} | Recurring: ${p.recurring ? p.recurring.interval : 'once-time'} | Active: ${p.active}\n`;
    });
  } catch (err) {
    output += `ERROR: ${err.message}\n`;
  }
  fs.writeFileSync('all_stripe_prices.txt', output);
}

run();
