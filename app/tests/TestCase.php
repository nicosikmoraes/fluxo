<?php

namespace Tests;

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    protected $serverVariables = ['HTTP_ACCEPT_LANGUAGE' => 'pt-BR'];

    protected function setUp(): void
    {
        parent::setUp();
        config(['billing.pro_price_id' => 'price_fluxo_test']);
    }

    public function createApplication(): Application
    {
        $app = parent::createApplication();
        $connection = $app['config']->get('database.default');
        $database = $app['config']->get('database.connections.'.$connection.'.database');
        $url = $app['config']->get('database.connections.'.$connection.'.url');
        $sqlite = $connection === 'sqlite' && $database === ':memory:';
        $postgres = $connection === 'pgsql'
            && getenv('FLUXO_TEST_POSTGRES') === '1'
            && is_string($database)
            && preg_match('/^fluxo_test(?:_[a-z0-9_]+)?$/', $database);
        if (! $app->environment('testing') || $url || (! $sqlite && ! $postgres)) {
            throw new RuntimeException('Use SQLite em memória ou PostgreSQL descartável chamado fluxo_test, com FLUXO_TEST_POSTGRES=1 e DB_URL vazio.');
        }

        return $app;
    }
}
