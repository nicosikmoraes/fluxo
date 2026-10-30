<?php

return [
    'enabled' => env('BILLING_ENABLED', false),
    'pro_price_id' => env('STRIPE_PRO_PRICE_ID'),
    'amounts' => ['usd' => 500, 'brl' => 1299],
    'currency' => 'usd',
    'interval' => 'month',
    'ads_enabled' => env('ADS_ENABLED', false),
    'free_projects' => 3,
    'free_roadmaps_per_project' => 1,
];
