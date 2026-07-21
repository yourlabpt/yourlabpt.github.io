const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const engineering = require('../lib/engineering-state');
const deliveryOs = require('../lib/delivery-os');
const projectAudit = require('../lib/project-audit');

function project(overrides = {}) {
  return {
    id: 'prj_test',
    name: 'Engineering test',
    deliveryLevel: 'standard',
    featureFlags: { engineering_state_v1: true },
    vision: { problemMarkdown: 'Legacy problem', mainIdeaMarkdown: 'Legacy intent' },
    discovery: {
      stakeholders: [{ name: 'Operator', needs: ['Clarity'] }],
      assumptions: ['Legacy assumption'],
      researchSources: [{ id: 'SRC-01', title: 'Official source', url: 'https://example.gov/source' }],
    },
    requirements: [{ id: 'REQ-1', title: 'A requirement', type: 'functional', status: 'draft' }],
    traceLinks: [],
    engineeringState: { schemaVersion: 1, revision: 0, entities: [], relationships: [], externalReferences: [] },
    engineeringChangeSets: [],
    versionSnapshots: [],
    ...overrides,
  };
}

function changeSet(overrides = {}) {
  return {
    schemaVersion: 'engineering-change-set/v1',
    id: 'engcs_test',
    projectId: 'prj_test',
    taskId: 'witem_test',
    runId: 'run_test',
    baseEngineeringRevision: 0,
    summary: 'Create structured context',
    sections: [{
      id: 'context',
      title: 'Context',
      decision: 'approved',
      operations: [
        {
          id: 'create-problem',
          type: 'create_entity',
          entity: {
            id: 'problem-1',
            type: 'problem',
            title: 'Customer cannot inspect delivery state',
            attributes: { descriptionMarkdown: 'The current flow is opaque.' },
          },
        },
        {
          id: 'create-intent',
          type: 'create_entity',
          entity: {
            id: 'intent-1',
            type: 'intent',
            title: 'Transparent delivery',
            attributes: { descriptionMarkdown: 'Make progress reviewable.' },
          },
        },
      ],
    }],
    documentsToRegenerate: ['idea'],
    inconsistenciesFound: [],
    assumptionsMade: [],
    questionsForHuman: [],
    impactAssessment: {
      level: 'local', affectedEntityIds: [], affectedDocumentIds: ['idea'], requiredChecks: ['idea_projection'], rationale: 'Idea changes only.',
    },
    evidence: [],
    recommendedTasks: [{ id: 'suggestion-1', title: 'Validate with users' }],
    confidence: 0.9,
    requiresHumanApproval: true,
    ...overrides,
  };
}

describe('Engineering State V1', () => {
  it('projects existing project fields without copying requirements into stored state', () => {
    const sample = project();
    const graph = engineering.getGraph(sample);
    assert.ok(graph.entities.some((entry) => entry.type === 'problem' && entry.virtual));
    assert.ok(graph.entities.some((entry) => entry.id === 'REQ-1' && entry.type === 'requirement'));
    assert.equal(engineering.normalizeState(sample.engineeringState).entities.length, 0);
    assert.equal(engineering.diagnostics(sample).projected.requirements, 1);
  });

  it('validates the shared change-set contract and rejects immutable patches', () => {
    assert.equal(engineering.validateChangeSet(changeSet(), project()).valid, true);
    const invalid = changeSet({
      sections: [{
        id: 'bad', title: 'Bad', operations: [{
          id: 'bad-op', type: 'update_entity', entityId: 'problem-1', expectedEntityVersion: 1,
          patch: [{ op: 'replace', path: '/id', value: 'different' }],
        }],
      }],
    });
    const result = engineering.validateChangeSet(invalid, project());
    assert.equal(result.valid, false);
    assert.match(result.errors.join(' '), /id is immutable/);
  });

  it('applies all approved sections atomically and is idempotent after persistence', () => {
    const sample = project();
    const applied = engineering.applyApprovedChangeSet(sample, changeSet(), { actorId: 'usr_1', now: '2026-07-21T12:00:00.000Z' });
    assert.equal(applied.state.revision, 1);
    assert.equal(applied.state.entities.length, 2);
    sample.engineeringState = applied.state;
    sample.engineeringChangeSets = [applied.changeSet];
    engineering.projectStateToLegacy(sample);
    assert.equal(sample.vision.problemMarkdown, 'The current flow is opaque.');
    assert.equal(sample.vision.mainIdeaMarkdown, 'Make progress reviewable.');
    const replay = engineering.applyApprovedChangeSet(sample, applied.changeSet, { actorId: 'usr_1' });
    assert.equal(replay.replayed, true);
    assert.equal(replay.state.revision, 1);
  });

  it('rejects stale revisions without changing project state', () => {
    const sample = project({ engineeringState: { schemaVersion: 1, revision: 2, entities: [], relationships: [], externalReferences: [] } });
    const before = JSON.stringify(sample);
    assert.throws(() => engineering.applyApprovedChangeSet(sample, changeSet(), { actorId: 'usr_1' }), /Stale engineering change set/);
    assert.equal(JSON.stringify(sample), before);
  });

  it('requires every section to receive a decision before apply', () => {
    const pending = changeSet({ sections: [
      changeSet().sections[0],
      { id: 'pending', title: 'Pending', decision: 'pending', operations: [{
        id: 'risk', type: 'create_entity', entity: { id: 'risk-1', type: 'risk', title: 'Risk', attributes: {} },
      }] },
    ] });
    assert.throws(() => engineering.applyApprovedChangeSet(project(), pending), /Every change set section/);
  });

  it('preserves project context in snapshots and rollback', () => {
    const sample = project();
    const snapshot = deliveryOs.createProjectSnapshot(sample, 'Before engineering apply', 'usr_1', 'discovery');
    sample.engineeringState = { schemaVersion: 1, revision: 9, entities: [], relationships: [], externalReferences: [] };
    sample.engineeringChangeSets = [];
    projectAudit.restoreProjectFromSnapshot(sample, snapshot.snapshotData);
    assert.equal(sample.engineeringState.revision, 0);
    assert.deepEqual(sample.engineeringChangeSets, []);
  });

  it('calculates typed downstream impact without mutating the project', () => {
    const sample = project({
      engineeringState: {
        schemaVersion: 1,
        revision: 1,
        entities: [
          { id: 'problem-1', type: 'problem', title: 'Problem', attributes: {} },
          { id: 'objective-1', type: 'objective', title: 'Objective', attributes: { phase: 'discovery' } },
        ],
        relationships: [{
          id: 'rel-1', sourceType: 'problem', sourceId: 'problem-1', targetType: 'objective', targetId: 'objective-1', relationshipType: 'derives_from',
        }],
        externalReferences: [],
      },
    });
    const before = JSON.stringify(sample);
    const impact = engineering.calculateImpact(sample, 'problem', 'problem-1');
    assert.equal(impact.level, 'local');
    assert.deepEqual(impact.impacted.map((entry) => entry.id), ['objective-1']);
    assert.equal(JSON.stringify(sample), before);
  });

  it('keeps recommendations as suggestions instead of creating Tasks', () => {
    const sample = project();
    const applied = engineering.applyApprovedChangeSet(sample, changeSet(), { actorId: 'usr_1' });
    assert.equal(applied.changeSet.recommendedTasks[0].status, 'suggested');
    const suggestions = engineering.syncRecommendedTaskSuggestions(sample, applied.changeSet, '2026-07-21T12:00:00.000Z');
    assert.equal(suggestions.length, 1);
    assert.equal(sample.taskSuggestions[0].status, 'proposed');
    assert.equal(sample.taskSuggestions[0].sourceRefs[0].type, 'engineering_change_set');
    assert.equal(engineering.syncRecommendedTaskSuggestions(sample, applied.changeSet).length, 0);
    assert.equal(sample.workItems, undefined);
  });

  it('fingerprints proposals independently from review decisions for idempotent ingestion', () => {
    const original = changeSet();
    const reviewed = changeSet({
      status: 'reviewed',
      sections: original.sections.map((section) => ({ ...section, decision: 'rejected', decidedBy: 'usr_1' })),
    });
    assert.equal(
      engineering.changeSetProposalFingerprint(original),
      engineering.changeSetProposalFingerprint(reviewed),
    );
  });

  it('adapts architecture, roadmap and external references without replacing legacy records', () => {
    const sample = project({
      capabilities: [{ id: 'cap-1', name: 'Checkout' }],
      decisions: [{ id: 'decision-1', text: 'Use an event log' }],
      artifacts: [
        { id: 'component-1', type: 'architecture_object', name: 'API' },
        { id: 'data-1', type: 'data_entity', name: 'Order' },
        { id: 'interface-1', type: 'api_endpoint', name: 'POST /orders' },
      ],
      roadmap: { phases: [{ id: 'phase-1', name: 'MVP', milestones: [{ id: 'mile-1', name: 'Checkout ready' }] }] },
      integrationMappings: [{ id: 'map-1', system: 'jira', externalId: 'ABC-1', externalUrl: 'https://jira.example/ABC-1', internalType: 'requirement' }],
    });
    const graph = engineering.getGraph(sample);
    assert.ok(graph.entities.some((entry) => entry.type === 'architecture_decision'));
    assert.ok(graph.entities.some((entry) => entry.type === 'component'));
    assert.ok(graph.entities.some((entry) => entry.type === 'interface'));
    assert.ok(graph.entities.some((entry) => entry.type === 'data_entity'));
    assert.ok(graph.entities.some((entry) => entry.type === 'roadmap_item'));
    assert.ok(graph.entities.some((entry) => entry.type === 'milestone'));
    assert.equal(graph.externalReferences[0].provider, 'jira');
    assert.equal(sample.decisions.length, 1);
    assert.equal(sample.integrationMappings.length, 1);
  });

  it('reports dependency cycles deterministically without asking an LLM', () => {
    const sample = project({
      engineeringState: {
        schemaVersion: 1, revision: 1,
        entities: [
          { id: 'need-1', type: 'need', title: 'Need 1', attributes: {} },
          { id: 'need-2', type: 'need', title: 'Need 2', attributes: {} },
        ],
        relationships: [
          { id: 'rel-1', sourceType: 'need', sourceId: 'need-1', targetType: 'need', targetId: 'need-2', relationshipType: 'depends_on' },
          { id: 'rel-2', sourceType: 'need', sourceId: 'need-2', targetType: 'need', targetId: 'need-1', relationshipType: 'depends_on' },
        ],
        externalReferences: [],
      },
    });
    const result = engineering.diagnostics(sample);
    assert.ok(result.findings.some((finding) => finding.type === 'dependency_cycle' && finding.severity === 'error'));
    assert.equal(result.healthy, false);
  });

  it('keeps change-set review visible in the existing Task detail editor', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'work-items-ui.js'), 'utf8');
    assert.match(source, /detailChangeSets/);
    assert.match(source, /Alterações de engenharia propostas/);
    assert.match(source, /data-engineering-decision/);
    assert.match(source, /engineering:changed/);
  });
});
