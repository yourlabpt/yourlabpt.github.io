const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  normalizePlatformSettings,
  readAgentPlatformSettings,
  writeAgentPlatformSettings,
  mergeWithPlatformDefaults,
} = require('../lib/agent-platform-settings');

describe('agent platform settings', () => {
  it('normalizes execution defaults with review policy', () => {
    const settings = normalizePlatformSettings({
      executionDefaults: {
        pauseForSubtaskReview: true,
        modelProfileId: 'large',
      },
    });
    assert.equal(settings.executionDefaults.modelProfileId, 'large');
    assert.equal(settings.executionDefaults.pauseForSubtaskReview, true);
    assert.equal(settings.executionDefaults.reviewPolicy.subtask, 'blocking');
  });

  it('persists and reloads settings from disk', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-settings-'));
    const saved = await writeAgentPlatformSettings(dir, {
      executionDefaults: { externalMaxTokens: 64000 },
    }, 'tester');
    const loaded = await readAgentPlatformSettings(dir);
    assert.equal(saved.executionDefaults.externalMaxTokens, 64000);
    assert.equal(loaded.executionDefaults.externalMaxTokens, 64000);
    assert.equal(loaded.updatedBy, 'tester');
  });

  it('merges platform defaults under task overrides', () => {
    const merged = mergeWithPlatformDefaults(
      { modelProfileId: 'small', pauseForSubtaskReview: true },
      normalizePlatformSettings({ executionDefaults: { modelProfileId: 'medium', externalMaxTokens: 90000 } }),
    );
    assert.equal(merged.modelProfileId, 'small');
    assert.equal(merged.externalMaxTokens, 90000);
    assert.equal(merged.pauseForSubtaskReview, true);
  });
});
