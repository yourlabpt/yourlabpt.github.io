const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const reqHierarchy = require('../lib/requirement-hierarchy');

describe('requirement hierarchy analysis', () => {
  it('reports incomplete stakeholder chains separately from orphan requirements', () => {
    const project = {
      id: 'prj_hierarchy_health',
      requirements: [
        { id: 'STK-01', type: 'stakeholder', title: 'Complete chain' },
        { id: 'FR-01', type: 'functional', title: 'Feature', parentId: 'STK-01' },
        { id: 'RNF-01', type: 'non_functional', title: 'Constraint', parentId: 'FR-01' },
        { id: 'TC-01', type: 'test_case', title: 'Acceptance', parentId: 'FR-01' },
        { id: 'STK-02', type: 'stakeholder', title: 'Missing RNF and TC' },
        { id: 'FR-02', type: 'functional', title: 'Partial feature', parentId: 'STK-02' },
        { id: 'FR-03', type: 'functional', title: 'Orphan feature' },
      ],
    };

    const analysis = reqHierarchy.analyzeRequirementHierarchy(project);

    assert.equal(analysis.stats.orphans, 1);
    assert.equal(analysis.orphans[0].id, 'FR-03');
    assert.equal(analysis.stats.stakeholderChains, 2);
    assert.equal(analysis.stats.completeChains, 1);
    assert.equal(analysis.stats.incompleteChains, 1);
    assert.equal(analysis.stats.chainCoveragePct, 50);
    assert.deepEqual(analysis.incompleteChains[0].missing, ['non_functional', 'test_case']);
  });
});
