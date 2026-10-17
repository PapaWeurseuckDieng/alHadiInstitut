import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export default async function setup() {
  const candidates = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'),
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
  ]
  const docker = candidates.find(path => path && existsSync(path)) || 'docker'
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const name = `alhadi-dashboard-browser-${process.pid}`
  const run = args => execFileSync(docker, args, { encoding: 'utf8', timeout: 30000, windowsHide: true })
  const image = run(['compose', '-f', join(root, 'docker-compose.yml'), 'images', '-q', 'app']).trim()
  if (!image) throw new Error('Build the backend image first: docker compose build app')
  // CLI OPcache keeps PHP bytecode in memory despite the Windows bind mount.
  // The only database used is SQLite in /tmp; MySQL is never accessed by these tests.
  const containerId = run(['run', '-d', '--name', name, '--label', 'alhadi.test-suite=dashboard', '-p', '127.0.0.1:8092:8000',
    '--mount', `type=bind,source=${join(root, 'backend')},target=/var/www/html,readonly`,
    // Photos envoyées pendant les tests : dossier temporaire en écriture, effacé avec le conteneur
    '--mount', 'type=tmpfs,destination=/var/www/html/storage/app/public',
    '-e', 'APP_URL=http://localhost:8092',
    // Plusieurs processus PHP : sans cela, les requêtes simultanées de l'interface attendent
    // les unes après les autres et peuvent dépasser le délai de 15 s du client API
    '-e', 'PHP_CLI_SERVER_WORKERS=4',
    '-e', 'APP_ENV=testing', '-e', 'DB_CONNECTION=sqlite', '-e', 'DB_DATABASE=/tmp/alhadi-dashboard-browser.sqlite',
    '-e', 'APP_KEY=base64:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    '-e', 'DB_URL=', '-e', 'CACHE_STORE=array', '-e', 'SESSION_DRIVER=array', '-e', 'BCRYPT_ROUNDS=4',
    '-e', 'LOG_CHANNEL=stderr', '-e', 'VIEW_COMPILED_PATH=/tmp/alhadi-views',
    '-e', 'CORS_ALLOWED_ORIGINS=http://localhost:5174',
    // Config et routes mises en cache dans /tmp (le code est monté en lecture seule) : chaque requête
    // évite de relire une vingtaine de fichiers sur le montage Windows, lent sous charge
    '-e', 'APP_CONFIG_CACHE=/tmp/alhadi-cache/config.php', '-e', 'APP_ROUTES_CACHE=/tmp/alhadi-cache/routes.php', image,
    'sh', '-c', 'mkdir -p /tmp/alhadi-views /tmp/alhadi-cache && php tests/Browser/seed.php && php artisan config:cache && php artisan route:cache && cd public && php -d opcache.enable_cli=1 -d opcache.validate_timestamps=0 -S 0.0.0.0:8000 ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php']).trim()
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw new Error('Unexpected test container ID; cleanup was not attempted.')
  const cleanup = () => { run(['rm', '-f', containerId]) }
  try {
    const deadline = Date.now() + 300000
    while (Date.now() < deadline) {
      if (run(['inspect', '-f', '{{.State.Running}}', containerId]).trim() !== 'true') throw new Error(run(['logs', containerId]))
      try {
        const response = await fetch('http://127.0.0.1:8092/api/v1/auth/me', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) })
        if (response.status === 401) return cleanup
      } catch { /* PHP starts after the isolated fixtures are ready. */ }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    throw new Error('Isolated API did not start within five minutes.')
  } catch (error) {
    cleanup()
    throw error
  }
}
