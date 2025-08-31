<?php

namespace App\Controller;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Process;
use Symfony\Component\Routing\Attribute\Route;

final class K6Controller
{
    #[Route('/k6/run', name: 'k6_run', methods: ['GET', 'POST'])]
    public function run(Request $request): JsonResponse
    {
        // Merge query + JSON body
        $json = [];
        if ($request->getContent()) {
            $parsed = json_decode($request->getContent(), true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($parsed)) {
                $json = $parsed;
            }
        }
        $in = array_merge($request->query->all(), $json);

        // Defaults
        $defaults = [
            'BACKEND'       => 'pimcore', // pimcore|symfony
            'ENGINE'        => 'es',      // es|sql
            'REQS'          => null,      // exact concurrent requests; if set -> vus=iterations=reqs
            'NO_THRESH'     => '0',
            'VUS'           => '50',
            'DURATION'      => '30s',
            'SLEEP'         => '0.2',
            'DEBUG'         => '0',
            'SAMPLE_MODE'   => 'fail',    // fail|success|all
            'FAIL_SAMPLE'   => '5',
            'PRINT_SAMPLES' => '0',
            'MAX_BODY'      => '1000',

            // ProductQuery
            'brandId'    => null,
            'categoryId' => null,
            'q'          => null,
            'priceMin'   => null,
            'priceMax'   => null,
            'stockMin'   => null,
            'stockMax'   => null,
            'sort'       => 'name',
            'dir'        => 'asc',
            'page'       => '1',
            'perPage'    => '25',
        ];

        // Whitelist mapping: request key -> env key
        $allowed = [
            'backend' => 'BACKEND',
            'engine'  => 'ENGINE',
            'reqs'    => 'REQS',
            'no_thresh' => 'NO_THRESH',
            'vus'     => 'VUS',
            'duration'=> 'DURATION',
            'sleep'   => 'SLEEP',
            'debug'   => 'DEBUG',
            'sample_mode' => 'SAMPLE_MODE',
            'fail_sample' => 'FAIL_SAMPLE',
            'print_samples' => 'PRINT_SAMPLES',
            'max_body' => 'MAX_BODY',

            // ProductQuery
            'brandId'    => 'brandId',
            'categoryId' => 'categoryId',
            'q'          => 'q',
            'priceMin'   => 'priceMin',
            'priceMax'   => 'priceMax',
            'stockMin'   => 'stockMin',
            'stockMax'   => 'stockMax',
            'sort'       => 'sort',
            'dir'        => 'dir',
            'page'       => 'page',
            'perPage'    => 'perPage',
        ];

        // Build env for k6
        $env = [];
        foreach ($defaults as $k => $v) {
            $env[$k] = $v;
        }
        foreach ($allowed as $reqKey => $envKey) {
            if (array_key_exists($reqKey, $in) && $in[$reqKey] !== null && $in[$reqKey] !== '') {
                // cast scalars to string for env
                $env[$envKey] = is_scalar($in[$reqKey]) ? (string)$in[$reqKey] : json_encode($in[$reqKey]);
            }
        }

        // Always route via ddev router from inside container
        $env['USE_ROUTER'] = '1';

        // Where the script lives (adjust if needed)
        $workdir  = '/var/www/html';
        $script   = $workdir . '/k6/compare-products.js';
        $sumFile  = $workdir . '/summary.json';

        // Remove old summary (if any)
        @unlink($sumFile);

        // If REQS provided, set vus=iterations=reqs; otherwise rely on VUS/DURATION
        $args = ['k6', 'run', $script];
        if (!empty($env['REQS']) && ctype_digit((string)$env['REQS'])) {
            $args = ['k6', 'run', '--vus', $env['REQS'], '--iterations', $env['REQS'], $script];
        } else {
            // allow custom VUS/DURATION via env (already in env), no extra flags required
        }

        // Run k6
        $process = new Process($args, $workdir, $env, null, 300); // 300s timeout, tweak as you like
        try {
            $process->mustRun();
        } catch (ProcessFailedException $e) {
            // Try to read summary anyway; include stderr for context
            $stderr = $process->getErrorOutput();
            $stdout = $process->getOutput();
            $payload = [
                'error' => 'k6 failed',
                'exit_code' => $process->getExitCode(),
                'stdout_tail' => substr($stdout, -4000),
                'stderr_tail' => substr($stderr, -4000),
            ];
            // include summary if present
            if (is_file($sumFile)) {
                $payload['summary'] = json_decode((string)file_get_contents($sumFile), true);
            }
            return new JsonResponse($payload, 500);
        }

        // Load the produced summary.json (from handleSummary)
        if (!is_file($sumFile)) {
            return new JsonResponse([
                'error' => 'summary.json not found after k6 run',
                'stdout_tail' => substr($process->getOutput(), -4000),
                'stderr_tail' => substr($process->getErrorOutput(), -4000),
            ], 500);
        }

        $summary = json_decode((string)file_get_contents($sumFile), true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return new JsonResponse([
                'error' => 'summary.json is not valid JSON',
                'json_error' => json_last_error_msg(),
                'raw' => substr((string)file_get_contents($sumFile), 0, 1000),
            ], 500);
        }

        // Return k6 summary as-is, plus some meta
        return new JsonResponse([
            'ok'      => true,
            'meta'    => [
                'started_at' => (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
                'args'       => $args,
            ],
            'env_used'=> [
                'BACKEND' => $env['BACKEND'],
                'ENGINE'  => $env['ENGINE'],
                'REQS'    => $env['REQS'],
                'VUS'     => $env['VUS'],
                'DURATION'=> $env['DURATION'],
                'SLEEP'   => $env['SLEEP'],
                'NO_THRESH' => $env['NO_THRESH'],
                'USE_ROUTER' => $env['USE_ROUTER'],
            ],
            'summary' => $summary,
        ], 200);
    }

    #[Route('/k6/seed', name: 'k6_seed', methods: ['GET', 'POST'])]
    public function seed(Request $request): JsonResponse
    {
        // --- Merge query + JSON body (same as /k6/run) ---
        $json = [];
        if ($request->getContent()) {
            $parsed = json_decode($request->getContent(), true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($parsed)) {
                $json = $parsed;
            }
        }
        $in = array_merge($request->query->all(), $json);

        // --- Defaults (seed-specific, but aligned style) ---
        $defaults = [
            'BACKEND'   => 'pimcore',
            'COUNT'     => '100',
            'REQS'      => null,
            'NO_THRESH' => '1',
            'VUS'       => '10',
            'DURATION'  => '10s',
            'SLEEP'     => '0',
            // debug knobs
            'DEBUG'         => '0',
            'SAMPLE_MODE'   => 'fail',
            'FAIL_SAMPLE'   => '5',
            'PRINT_SAMPLES' => '0',
            'MAX_BODY'      => '1000',
        ];

        $allowed = [
            'backend'   => 'BACKEND',
            'count'     => 'COUNT',
            'reqs'      => 'REQS',
            'no_thresh' => 'NO_THRESH',
            'vus'       => 'VUS',
            'duration'  => 'DURATION',
            'sleep'     => 'SLEEP',
            // debug
            'debug'         => 'DEBUG',
            'sample_mode'   => 'SAMPLE_MODE',
            'fail_sample'   => 'FAIL_SAMPLE',
            'print_samples' => 'PRINT_SAMPLES',
            'max_body'      => 'MAX_BODY',
        ];

        // --- Build env for k6 (same pattern as /k6/run) ---
        $env = [];
        foreach ($defaults as $k => $v) {
            $env[$k] = $v;
        }
        foreach ($allowed as $reqKey => $envKey) {
            if (array_key_exists($reqKey, $in) && $in[$reqKey] !== null && $in[$reqKey] !== '') {
                $env[$envKey] = is_scalar($in[$reqKey]) ? (string)$in[$reqKey] : json_encode($in[$reqKey]);
            }
        }

        // Always route via ddev router from inside container (same as /k6/run)
        $env['USE_ROUTER'] = '1';

        // --- Script/summary paths (identical layout to /k6/run) ---
        $workdir = '/var/www/html';
        $script  = $workdir . '/k6/seed-products.js'; // place the script NEXT TO compare-products.js
        $sumFile = $workdir . '/summary.json';

        if (!is_file($script)) {
            return new JsonResponse(['error' => 'k6 script not found at '.$script], 500);
        }

        // Remove old summary (if any)
        @unlink($sumFile);

        // If REQS provided, set vus=iterations=reqs; otherwise rely on VUS/DURATION
        $args = ['k6', 'run', $script];
        if (!empty($env['REQS']) && ctype_digit((string)$env['REQS'])) {
            $args = ['k6', 'run', '--vus', $env['REQS'], '--iterations', $env['REQS'], $script];
        }

        // --- Run k6 (Symfony Process, same as /k6/run) ---
        $process = new Process($args, $workdir, $env, null, 600); // seed can take longer
        try {
            $process->mustRun();
        } catch (\Symfony\Component\Process\Exception\ProcessFailedException $e) {
            $stderr = $process->getErrorOutput();
            $stdout = $process->getOutput();
            $payload = [
                'error'        => 'k6 failed',
                'exit_code'    => $process->getExitCode(),
                'stdout_tail'  => substr($stdout, -4000),
                'stderr_tail'  => substr($stderr, -4000),
            ];
            if (is_file($sumFile)) {
                $payload['summary'] = json_decode((string)file_get_contents($sumFile), true);
            }
            return new JsonResponse($payload, 500);
        }

        if (!is_file($sumFile)) {
            return new JsonResponse([
                'error'       => 'summary.json not found after k6 run',
                'stdout_tail' => substr($process->getOutput(), -4000),
                'stderr_tail' => substr($process->getErrorOutput(), -4000),
            ], 500);
        }

        $summary = json_decode((string)file_get_contents($sumFile), true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return new JsonResponse([
                'error'      => 'summary.json is not valid JSON',
                'json_error' => json_last_error_msg(),
                'raw'        => substr((string)file_get_contents($sumFile), 0, 1000),
            ], 500);
        }

        // --- Return same wrapper shape as /k6/run ---
        return new JsonResponse([
            'ok'      => true,
            'meta'    => [
                'started_at' => (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
                'args'       => $args,
            ],
            'env_used'=> [
                'BACKEND'   => $env['BACKEND'],
                'COUNT'     => $env['COUNT'],
                'REQS'      => $env['REQS'],
                'VUS'       => $env['VUS'],
                'DURATION'  => $env['DURATION'],
                'SLEEP'     => $env['SLEEP'],
                'NO_THRESH' => $env['NO_THRESH'],
                'USE_ROUTER'=> $env['USE_ROUTER'],
            ],
            'summary' => $summary,
        ], 200);
    }

    #[Route('/k6/update', name: 'k6_update', methods: ['GET', 'POST'])]
    public function update(Request $request): JsonResponse
    {
        // Merge query + JSON body
        $json = [];
        if ($request->getContent()) {
            $parsed = json_decode($request->getContent(), true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($parsed)) {
                $json = $parsed;
            }
        }
        $in = array_merge($request->query->all(), $json);

        // Controls (similar to /k6/run & /k6/seed)
        $defaults = [
            'BACKEND'       => 'pimcore', // pimcore|symfony
            'ENGINE'        => 'es',      // es|sql
            'ID'            => null,      // required
            'REQS'          => null,      // vus=iterations when provided
            'NO_THRESH'     => '1',
            'VUS'           => '10',
            'DURATION'      => '10s',
            'SLEEP'         => '0',
            'DEBUG'         => '0',
            'SAMPLE_MODE'   => 'fail',    // fail|success|all
            'FAIL_SAMPLE'   => '5',
            'PRINT_SAMPLES' => '0',
            'MAX_BODY'      => '1000',
        ];

        // Whitelist mapping for controls
        $allowed = [
            'backend'       => 'BACKEND',
            'engine'        => 'ENGINE',
            'id'            => 'ID',
            'reqs'          => 'REQS',
            'no_thresh'     => 'NO_THRESH',
            'vus'           => 'VUS',
            'duration'      => 'DURATION',
            'sleep'         => 'SLEEP',
            'debug'         => 'DEBUG',
            'sample_mode'   => 'SAMPLE_MODE',
            'fail_sample'   => 'FAIL_SAMPLE',
            'print_samples' => 'PRINT_SAMPLES',
            'max_body'      => 'MAX_BODY',
        ];

        // Build env for k6
        $env = $defaults;
        foreach ($allowed as $reqKey => $envKey) {
            if (array_key_exists($reqKey, $in) && $in[$reqKey] !== null && $in[$reqKey] !== '') {
                $env[$envKey] = is_scalar($in[$reqKey]) ? (string)$in[$reqKey] : json_encode($in[$reqKey]);
            }
        }

        // Validate required ID
        if (empty($env['ID'])) {
            return new JsonResponse(['error' => 'Missing required parameter: id'], 400);
        }

        // Determine update JSON body:
        //  - If client sent a top-level "body", use it (supports nested).
        //  - Else, forward all non-control keys as the payload (lets you send {name,sku,...} directly).
        $payload = [];
        if (array_key_exists('body', $in)) {
            $payload = is_array($in['body'])
                ? $in['body']
                : (is_string($in['body']) ? json_decode($in['body'], true) : []);
            if (!is_array($payload)) $payload = [];
        } else {
            $controlKeys = array_keys($allowed);
            // also exclude the uppercased ENV names in case someone posted those
            $controlKeys = array_merge($controlKeys, array_values($allowed));
            foreach ($in as $k => $v) {
                if (!in_array($k, $controlKeys, true)) {
                    $payload[$k] = $v;
                }
            }
        }
        $env['UPDATE_BODY'] = json_encode($payload, JSON_UNESCAPED_SLASHES);

        // Always route via ddev router from inside container
        $env['USE_ROUTER'] = '1';

        // Script/summary paths
        $workdir = '/var/www/html';
        $script  = $workdir . '/k6/update-product.js';
        $sumFile = $workdir . '/summary.json';

        if (!is_file($script)) {
            return new JsonResponse(['error' => 'k6 script not found at '.$script], 500);
        }
        @unlink($sumFile);

        // Args
        $args = ['k6', 'run', $script];
        if (!empty($env['REQS']) && ctype_digit((string)$env['REQS'])) {
            $args = ['k6', 'run', '--vus', $env['REQS'], '--iterations', $env['REQS'], $script];
        }

        // Run
        $process = new \Symfony\Component\Process\Process($args, $workdir, $env, null, 600);
        try {
            $process->mustRun();
        } catch (\Symfony\Component\Process\Exception\ProcessFailedException $e) {
            $payload = [
                'error'        => 'k6 failed',
                'exit_code'    => $process->getExitCode(),
                'stdout_tail'  => substr($process->getOutput(), -4000),
                'stderr_tail'  => substr($process->getErrorOutput(), -4000),
            ];
            if (is_file($sumFile)) {
                $payload['summary'] = json_decode((string)file_get_contents($sumFile), true);
            }
            return new JsonResponse($payload, 500);
        }

        if (!is_file($sumFile)) {
            return new JsonResponse([
                'error'       => 'summary.json not found after k6 run',
                'stdout_tail' => substr($process->getOutput(), -4000),
                'stderr_tail' => substr($process->getErrorOutput(), -4000),
            ], 500);
        }

        $summary = json_decode((string)file_get_contents($sumFile), true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return new JsonResponse([
                'error'      => 'summary.json is not valid JSON',
                'json_error' => json_last_error_msg(),
                'raw'        => substr((string)file_get_contents($sumFile), 0, 1000),
            ], 500);
        }

        return new JsonResponse([
            'ok'      => true,
            'meta'    => [
                'started_at' => (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
                'args'       => $args,
            ],
            'env_used'=> [
                'BACKEND'   => $env['BACKEND'],
                'ENGINE'    => $env['ENGINE'],
                'ID'        => $env['ID'],
                'REQS'      => $env['REQS'],
                'VUS'       => $env['VUS'],
                'DURATION'  => $env['DURATION'],
                'SLEEP'     => $env['SLEEP'],
                'NO_THRESH' => $env['NO_THRESH'],
                'USE_ROUTER'=> $env['USE_ROUTER'],
            ],
            'summary' => $summary,
        ], 200);
    }

    #[Route('/k6/bulk-price', name: 'k6_bulk_price', methods: ['GET'])]
    public function bulkPrice(Request $request): JsonResponse
    {
        $backend = strtolower((string)$request->query->get('backend', 'pimcore'));
        if (!in_array($backend, ['pimcore', 'symfony'], true)) {
            return new JsonResponse(['error' => 'backend must be pimcore|symfony'], 400);
        }

        $engine = strtolower((string)$request->query->get('engine', 'es')); // es|sql
        if (!in_array($engine, ['es', 'sql'], true)) {
            return new JsonResponse(['error' => 'engine must be es|sql'], 400);
        }

        $percent = $request->query->get('percent', null);
        if (!is_numeric($percent)) {
            return new JsonResponse(['error' => 'percent is required, e.g. ?percent=10 or -5'], 400);
        }

        $count     = $request->query->get('count', '');
        $reqs      = (string)max(1, (int)$request->query->get('reqs', 1));
        $bulkPath  = (string)$request->query->get('bulk_path', ''); // optional override like /api/es/bulk-price

        // where script lives
        $script = '/var/www/html/k6/bulk-price.js';
        if (!is_file($script)) {
            return new JsonResponse(['error' => 'k6 script not found at '.$script], 500);
        }

        // working dir for summary.json output
        $workdir = \dirname(__DIR__, 2).'/var/k6_runs/'.date('Ymd_His').'_'.bin2hex(random_bytes(3));
        if (!is_dir($workdir) && !@mkdir($workdir, 0777, true)) {
            return new JsonResponse(['error' => 'failed to create workdir '.$workdir], 500);
        }

        // find k6
        $k6 = trim((string) shell_exec('command -v k6')) ?: '/usr/local/bin/k6';
        if (!is_file($k6)) {
            return new JsonResponse(['error' => 'k6 binary not found'], 500);
        }

        // env for script
        $env = [
            'BACKEND'      => $backend,
            'ENGINE'       => $engine,
            'PERCENT'      => (string)$percent,
            'COUNT'        => (string)$count,
            'REQS'         => $reqs,
            'USE_ROUTER'   => '1',
            'BASE_PIMCORE' => (string)($_ENV['PIMCORE_BASE_URL']  ?? 'https://pimcore-api.ddev.site'),
            'BASE_SYMFONY' => (string)($_ENV['SYMFONY_BASE_URL'] ?? 'https://symfony-api.ddev.site'),
            'NO_THRESH'    => '1',
        ];
        if ($bulkPath !== '') {
            $env['BULK_PATH'] = $bulkPath;
        }

        // build args (honor REQS)
        $args = [$k6, 'run'];
        if (ctype_digit($reqs) && (int)$reqs > 0) {
            $args[] = '--vus';        $args[] = $reqs;
            $args[] = '--iterations'; $args[] = $reqs;
        }
        $args[] = $script;

        // run
        $proc = new \Symfony\Component\Process\Process($args, $workdir, $env, null, 300);
        $proc->run();

        $summaryPath = $workdir.'/summary.json';
        if (is_file($summaryPath)) {
            $summary = json_decode((string)file_get_contents($summaryPath), true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return new JsonResponse($summary, 200);
            }
            return new JsonResponse([
                'error' => 'summary.json parse error',
                'raw'   => substr((string)file_get_contents($summaryPath), 0, 1000),
            ], 500);
        }

        return new JsonResponse([
            'error'       => 'k6 failed',
            'exit_code'   => $proc->getExitCode(),
            'stdout_tail' => substr($proc->getOutput(), -2000),
            'stderr_tail' => substr($proc->getErrorOutput(), -2000),
            'env_used'    => [
                'BACKEND' => $backend, 'ENGINE' => $engine, 'PERCENT' => (string)$percent,
                'COUNT' => (string)$count, 'REQS' => $reqs, 'BULK_PATH' => $bulkPath ?: '(default)',
            ],
        ], 500);
    }
}
