import { createLab, SCENARIOS } from './src/fixtures.mjs';
import { projectSurfaces } from './src/surfaces.mjs';

const scenario = process.argv[2] ?? 'ready';
if (!SCENARIOS.includes(scenario)) {
  process.stderr.write('Scenario: ' + SCENARIOS.join(', ') + '\n');
  process.exitCode = 1;
} else {
  const lab = createLab({ scenario });
  const result = await lab.engine.run({ manifest: lab.manifest, package: lab.package, request: lab.request });
  process.stdout.write(JSON.stringify({ syntheticOnly: true, canonical: result, ...projectSurfaces(result), traceChainValid: lab.engine.journal.verify() }, null, 2) + '\n');
}
