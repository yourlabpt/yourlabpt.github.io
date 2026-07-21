const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('stage-transition creation refreshes canonical Tasks before opening the task', () => {
  const deliverySource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'delivery-os-ui.js'),
    'utf8',
  );
  const workItemsSource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'work-items-ui.js'),
    'utf8',
  );
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'index.html'),
    'utf8',
  );

  assert.match(deliverySource, /WorkItemsUI\.refreshTasks\(project,[\s\S]*?resetFilters: true/);
  assert.match(deliverySource, /openTaskId: res\.parentTaskId \|\| res\.workItems\?\.\[0\]\?\.id/);
  assert.match(workItemsSource, /async function refreshTasks\(project, options = \{\}\)/);
  assert.match(workItemsSource, /if \(options\.resetFilters\) resetBrowseFilters\(\)/);
  assert.match(workItemsSource, /leaveEditorMode\(\);[\s\S]*?await fetchList\(project\.id\);[\s\S]*?refreshBoardView\(\)/);
  assert.match(workItemsSource, /request\.requestKind !== 'stage_transition'/);
  assert.match(deliverySource, /if \(agentType === 'discovery_research'\) \{[\s\S]*?openTransitionPicker\('idea', 'discovery', project\)/);
  assert.match(deliverySource, /Entregáveis aprovados da descoberta/);
  assert.match(deliverySource, /Stakeholders &amp; personas/);
  assert.match(deliverySource, /Evidência e lacunas/);
  assert.match(workItemsSource, /payload\.nextWorkItem[\s\S]*?apiRequest\('\/agent-runs'/);
  assert.match(workItemsSource, /data-ado-continue-plan/);
  assert.match(workItemsSource, /Executar todas as subtarefas/);
  assert.match(workItemsSource, /data-ado-run-control="abandon"/);
  assert.match(workItemsSource, /Terminar e desbloquear/);
  assert.match(workItemsSource, /Reiniciar do último checkpoint/);
  assert.match(workItemsSource, /Reiniciar tarefa com agente/);
  assert.doesNotMatch(workItemsSource, /Criar uma nova versão do pedido/);
  assert.match(workItemsSource, /function scheduleConnectionPoll/);
  assert.match(workItemsSource, /host\.matches\(':hover'\)/);
  assert.match(workItemsSource, /executionInteractionUntil = Date\.now\(\) \+ 4000/);
  assert.match(workItemsSource, /errorEventTypes/);
  assert.match(workItemsSource, /ado-agent-log-entry\$\{eventToneClass\(event\)\}/);
  assert.match(deliverySource, /linkedTask\?\.status === 'waiting_review'[\s\S]*?work-items\/\$\{linkedTask\.id\}\/review/);
  assert.match(html, /delivery-os-ui\.js\?v=72/);
  assert.match(html, /work-items-ui\.js\?v=27/);
});
