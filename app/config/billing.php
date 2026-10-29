<?php

return [
    'enabled' => env('BILLING_ENABLED', false),
    'pro_price_id' => env('STRIPE_PRO_PRICE_ID'),
    'amount' => 500,
    'currency' => 'usd',
    'interval' => 'month',
    'adaptive_pricing' => env('STRIPE_ADAPTIVE_PRICING', true),
    'ads_enabled' => env('ADS_ENABLED', false),
    'free_projects' => 3,
    'free_roadmaps_per_project' => 1,
];
