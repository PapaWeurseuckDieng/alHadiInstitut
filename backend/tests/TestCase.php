<?php

namespace Tests;

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    /**
     * Garde-fou : les tests vident la base (RefreshDatabase). Ils ne démarrent que sur une base
     * de test : SQLite en mémoire, ou une base nommée « testing » / « …_test » (CI MySQL).
     *
     * Dans le conteneur Docker, les variables d'environnement (DB_CONNECTION=mysql, DB_DATABASE=daara)
     * priment sur phpunit.xml : sans ce contrôle, « php artisan test » effacerait la base de développement.
     * Lancer les tests dans le conteneur :
     *   docker compose exec -e DB_CONNECTION=sqlite -e DB_DATABASE=:memory: app php artisan test
     */
    public function createApplication(): Application
    {
        $app = parent::createApplication();
        $connexion = $app['config']->get('database.default');
        $base = (string) $app['config']->get("database.connections.$connexion.database");

        if (! ($base === ':memory:' || $base === 'testing' || str_ends_with($base, '_test') || str_ends_with($base, '_testing'))) {
            throw new RuntimeException(
                "Tests refusés : ils videraient la base « $base » ($connexion). Utilisez une base de test, par exemple : "
                .'docker compose exec -e DB_CONNECTION=sqlite -e DB_DATABASE=:memory: app php artisan test'
            );
        }

        return $app;
    }
}
