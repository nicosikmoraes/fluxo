# Stripe subscriptions and international billing

Research snapshot: 28 October 2026. Official Stripe documentation and Brazil pricing pages were prioritized. This is product/architecture research, not tax or legal advice.

## How should BRL and USD pricing work across Portuguese and English?

### Takeaway
Stripe supports BRL and USD presentment and a single Price can carry multiple currency options. Keep locale and billing currency as related but separate settings: the app can default Portuguese/Brazil to BRL and English/US to USD, while letting the customer choose the market/price explicitly; Checkout can also choose a supported local currency from IP. Currency charged to the customer and currency paid out to the business are distinct, and exchange controls/settlement in Brazil warrant confirming the actual Stripe account setup.

### Cited Findings
- Stripe supports charging in 135+ currencies and explains that presentment (charge) currency and settlement (bank payout) currency are separate; if they differ, Stripe converts the charge to settlement currency. Brazil is listed among countries with foreign-exchange-control rules for remittances. — [Supported currencies](https://docs.stripe.com/currencies)
- BRL and USD appear in Stripe’s supported presentment currencies. Available payment methods depend on the country of the Stripe account. — [Supported currencies](https://docs.stripe.com/currencies)
- One Stripe Price can support multiple currencies. Checkout can choose the customer’s local currency by IP when supported by the Price; direct subscription creation requires passing `currency` to use a non-default currency option. — [Manage prices](https://docs.stripe.com/products-prices/manage-prices)
- Stripe says Brazilian accounts can accept cards and PIX, but PIX does not support recurring payments; Boleto is also offered, but it is not a recurring method in the Brazil accepted-methods list. — [Accepted payment methods in Brazil](https://support.stripe.com/questions/accepted-payment-methods-in-brazil)

### Inferences
- For a simple PT-BR/EN-US launch, make an explicit app-level market choice determine a configured BRL or USD Price ID, and send that Price ID to hosted Checkout. Language alone should not silently set the billing country, tax jurisdiction, or payout currency. If one Product has both currency options, ensure all coupons/other Prices in a Checkout Session support the intended currency.
- Prefer recurring card payments for the subscription MVP; do not promise PIX recurring billing based on the present Stripe Brazil support listing.
- Confirm whether the business’s Stripe account is Brazilian and which settlement currencies/bank accounts it can use before setting revenue forecasts or pricing. Presentment in USD alone does not establish USD payout.

### Gaps
- The exact settlement currencies, foreign exchange fees, and permitted payout flow for this business cannot be determined from general docs; they depend on the verified Stripe account country, payout accounts, and current account-specific schedule.
- The product’s intended definition of “English customer” (locale, residence, billing address, or manually chosen market) is a product decision, not one that Stripe documentation resolves.

## What subscription checkout and self-service should be used?

### Takeaway
Stripe-hosted Checkout in subscription mode is the lowest-complexity launch path; create each Checkout Session on the authenticated server and map its customer/subscription to the local user. Add Stripe’s hosted Customer Portal for billing details, payment method changes, invoice history, plan changes, and cancellation.

### Cited Findings
- Stripe recommends Checkout Sessions with `mode=subscription` for a hosted subscription flow. A typical integration has a site button call the app’s server to create the Session; a completed Checkout Session references its Customer and Subscription. — [Recurring payments](https://docs.stripe.com/recurring-payments); [Build a subscriptions integration](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=checkout&ui=stripe-hosted)
- Stripe’s Customer Portal lets customers update billing information and payment methods, change or cancel subscriptions, and view/pay/download invoices. It can localize to customers’ preferred browser language. — [Customer portal](https://docs.stripe.com/customer-management)
- The Portal can be configured to cancel immediately or at period end. It has update limitations for some subscription configurations, including subscriptions with trials, multiple products, usage billing, or invoice collection. — [Customer portal](https://docs.stripe.com/customer-management)
- Stripe supports trial periods and supplies `customer.subscription.trial_will_end`; however, the newer Trial Offer API documentation (as of this snapshot) requires API version `2026-09-30.endive`, flexible billing mode, and notes that Checkout trial-offer support is limited to a private preview/invited accounts. — [Subscription trials](https://docs.stripe.com/billing/subscriptions/trials)

### Inferences
- Keep a small catalog such as Free and Pro, with monthly/yearly Prices in BRL and USD if both markets launch. Store Stripe Customer ID, Subscription ID, selected Price/currency, and a local entitlement snapshot tied to the authenticated user.
- Configure portal cancellation at period end as the default for continuity, and make portal/checkout success pages informational; they should not be the authoritative access switch because Stripe’s billing changes are asynchronous.
- If offering a trial in the first iteration, use the documented standard subscription trial behavior supported by the chosen integration, verify its Checkout compatibility for the account/API version, and make trial-end/missing-payment behavior explicit. Avoid assuming the newer Trial Offer feature works for all accounts.

### Gaps
- Whether trial offers are available to the specific Stripe account and chosen API version should be verified in its Dashboard before implementation; Stripe documents account restrictions/private preview for the newest offer feature.
- Cancellation, renewal notice, refund, and consumer subscription requirements vary by customer jurisdiction and were not assessed here.

## Which webhooks should control paid features and project limits?

### Takeaway
Treat Stripe webhooks as the source of truth for subscription state. Verify webhook signatures, persist processed events idempotently, and update local access from the subscription/paid-invoice state or Stripe Entitlements rather than from the Checkout redirect.

### Cited Findings
- Stripe says a subscription integration needs a webhook destination because much of subscription activity is asynchronous, and requires verifying incoming event authenticity. — [Using webhooks with subscriptions](https://docs.stripe.com/billing/subscriptions/webhooks)
- Stripe documents `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, and `.trial_will_end`, plus `invoice.paid`, `invoice.payment_failed`, and `invoice.payment_action_required` as common subscription lifecycle events. `invoice.paid` can provision access when the Subscription is active; failed payments may warrant customer notification and configured retries. — [Using webhooks with subscriptions](https://docs.stripe.com/billing/subscriptions/webhooks)
- Stripe Entitlements emits `entitlements.active_entitlement_summary.updated` when a customer’s active entitlements change; Stripe says this can provision or de-provision feature access. — [Using webhooks with subscriptions](https://docs.stripe.com/billing/subscriptions/webhooks); [Entitlements](https://docs.stripe.com/billing/entitlements)
- Stripe notes production integrations should also consider `charge.refunded`, `charge.dispute.created`, and `radar.early_fraud_warning.created`; store local Customer data in sync with `customer.updated` if relevant. — [Using webhooks with subscriptions](https://docs.stripe.com/billing/subscriptions/webhooks)

### Inferences
- Define app capabilities in its own authorization layer: free users get at most three projects and no paid payment calculation; active paid users get payment calculation and unlimited projects. Stripe’s `Pro` entitlement should toggle those paid capabilities; project counts and object authorization remain enforced by the app/database.
- Recommended minimal event set: `checkout.session.completed` for customer/subscription association and reconciliation; `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`; `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`; and `entitlements.active_entitlement_summary.updated` if using Stripe Entitlements. Add refund/dispute events for a policy decision. Handle retries, duplicate/out-of-order deliveries, and retrieve current Stripe objects when event ordering leaves ambiguity.
- Define a grace-period policy for `past_due` and payment failures rather than granting indefinite Pro or revoking immediately without a recovery window. Reflect it in entitlement checks and user messaging.

### Gaps
- Stripe documentation describes event mechanics but does not decide this product’s grace period, refund/dispute access policy, or whether Stripe Entitlements or a local subscription state table is preferable; those are product choices.

## What fees and tax behavior affect the billing design?

### Takeaway
For a Brazil-based Stripe account, current public standard pricing lists a domestic-card processing fee and an additional international-card percentage, and Billing has a recurring-volume fee. Stripe Tax can calculate tax for subscriptions, but collection is enabled only where the business has an active tax registration; US SaaS sales tax is state/local and threshold-dependent. Budget processing, Billing, FX, and tax compliance separately.

### Cited Findings
- Stripe Brazil’s public pricing snapshot lists 3.99% + R$0.39 per successful card transaction for domestic cards and +2% for international cards (applied to the amount after conversion to local currency). The same page lists Stripe Billing at 0.7% of Billing volume, including Billing transactions processed on and off Stripe, with one-off invoices excluded. — [Stripe Brazil pricing](https://stripe.com/br/pricing)
- Stripe states currency conversion can apply when the charge currency differs from the settlement currency; it also cautions that a customer’s bank/card issuer might assess foreign exchange fees when its payment currency differs. — [Supported currencies](https://docs.stripe.com/currencies)
- Stripe Tax integrates with Billing to calculate tax on recurring payments and supports Checkout subscriptions. Stripe Tax only collects in jurisdictions where the business has an active registration; the business must register with the relevant government and add that registration to Stripe. — [Collect taxes for recurring payments](https://docs.stripe.com/tax/subscriptions)
- Stripe’s US guidance says sales tax rules vary by state/territory; registration thresholds, tax types, and included transactions are jurisdiction-specific. Stripe Tax provides monitoring/alerts and transaction reports; its state pages describe registration and filing resources. — [Collect tax in the United States](https://docs.stripe.com/tax/supported-countries/united-states/washington); [Stripe Tax overview](https://docs.stripe.com/tax)
- The US example for Washington lists a $100,000 remote-seller threshold for the specified sales-tax regime; this is one state-specific example, not a nationwide rule. — [Collect tax in Washington](https://docs.stripe.com/tax/supported-countries/united-states/washington)
- Stripe’s Brazil pricing FAQ says processing and currency-conversion fees from the original transaction are not returned on standard-priced refunds. — [Stripe Brazil pricing](https://stripe.com/br/pricing)

### Inferences
- Build tax calculation into Checkout/subscription creation as a configurable capability (for example, Stripe Tax automatic tax after registrations and product tax-code selection), and collect adequate billing address/location data. Keep tax amounts and currency on Stripe invoices/records; do not hard-code a single rate.
- Do not claim Stripe automatically handles all filing/remittance. Plan to evaluate Stripe’s reports/filing partners and local accounting support. Budget Stripe Billing’s fee in addition to payment processing, international card surcharge, possible conversion costs, and any tax-product fee.
- Set customer-facing prices with margin for cross-border processing and possible FX; quote the exact BRL/USD plan prices as separate decisions, not as live currency conversion, so a locale’s subscription renews at a predictable amount.

### Gaps
- This research did not establish whether Stripe Tax supports automated calculation/collection for the particular Brazilian SaaS tax treatment or whether this seller has Brazilian obligations under its company structure. Confirm with a Brazil tax professional and Stripe’s current supported-country/product-tax-code matrix.
- Applicable US nexus, SaaS taxability, and thresholds depend on the company’s presence and customer locations; a tax professional should review states before enabling collection. Stripe’s tools assist with calculations/monitoring but do not determine the seller’s legal registration strategy.
- Pricing page fees are account-country and contract dependent and may change; confirm the live Dashboard fee schedule and Billing terms before launch.
