# HipsterIA Referral & Ambassador API Documentation

## Referral Endpoints

### 1. Get Referral Stats
Returns the current user's referral code, total paid referrals, ambassador status, and pending rewards.

- **Endpoint**: `GET /referral/stats`
- **Auth**: Required (Bearer Token)
- **Response**:
```json
{
  "referralCode": "REF-JOE-ABCD",
  "totalReferred": 5,
  "isAmbassador": false,
  "freeMonthsPending": 2,
  "currency": "EUR"
}
```

### 2. Apply Referral Code
Applies a referral code to the current user (only works if no previous referral/paid sub).

- **Endpoint**: `POST /referral/apply`
- **Auth**: Required (Bearer Token)
- **Body**:
```json
{
  "code": "REF-JOE-ABCD"
}
```
- **Response**:
```json
{
  "message": "Referral code applied successfully"
}
```

## Payment & Pricing Logic

### 1. Referral Discount (Filleul)
When a referred user (filleul) subscribes:
- **Atelier**: **9.90€ / month** (stays at this price for 1 year if they stay active).
- **Studio**: **22.00€ / month** for the first **3 months**, then returns to 29.90€.
*Note: This is automatically detected by the backend when the user has a `referredBy` code.*

### 2. Ambassador Status
Users with **10 or more** active paid referrals gain **Ambassador Status**.
Ambassadors enjoy permanent reduced pricing:
- **Atelier**: 9.90€/month
- **Studio**: 22.00€/month
*Note: Ambassador status is lost if the user cancels their own subscription.*

### 3. Referrer Rewards (Parrainage)
For every successful paid sign-up (after trial) via their link:
- The referrer (parrain) receives **1 month free**.
- **Limit**: Maximum 1 free month can be earned per calendar month.
- Free months are tracked in `freeMonthsPending`.

## Webhooks

The Stripe webhook (`/ai/payment/webhook`) automatically handles:
- Transition from Trial to Active (triggers parrain reward).
- Ambassador status promotion (count >= 10).
- Ambassador status removal upon cancellation.
- Tracking of the 3-month discount period for Studio users.
