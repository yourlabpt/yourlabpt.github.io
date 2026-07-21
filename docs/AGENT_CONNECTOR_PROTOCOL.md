# YourLab Secure Outbound Agent Connector

This document defines the provider-neutral contract between the hosted Projects
Platform and a local agent platform. The first implementation is the YourLab
Agent Runtime, but the protocol does not require Ollama, a specific model
provider, or a specific agent framework.

## Architecture

The connection is always initiated by the local runtime:

1. A user approves a canonical agent task in Projects.
2. Projects freezes and hashes a `yourlab.agent-dispatch/v2` package in SQLite.
3. A paired runtime polls Projects over HTTPS and claims compatible work.
4. The runtime executes locally and sends signed progress and a signed result.
5. Projects validates the frozen-package hash and output contract.
6. The result enters human review. Connector results are never auto-applied.

Never expose or tunnel the local runtime port. In production use:

```dotenv
NODE_ENV=production
AGENT_CONNECTION_MODE=remote_pull
```

The local runtime uses `PLATFORM_BASE_URL=https://www.yourlabpt.com`. This value
is an origin and must not include `/projects`.

## Runtime capability manifest

Pairing and heartbeat requests may advertise any runtime that implements the
wire protocol:

```json
{
  "protocol": {
    "id": "yourlab.agent-dispatch",
    "versions": [1, 2]
  },
  "runtime": {
    "kind": "yourlab-agent-runtime",
    "version": "1.0.0"
  },
  "agents": [
    {
      "id": "implementation-agent",
      "name": "Implementation Agent",
      "taskTypes": ["implementation_tasks"],
      "skills": ["software_delivery"],
      "tools": ["repo.read", "repo.write", "tests.run"],
      "models": ["local-coder"],
      "budget": {
        "maxTokens": 120000,
        "maxWallClockMinutes": 180,
        "maxSubtasks": 8
      }
    }
  ],
  "skills": [],
  "tools": [],
  "models": [],
  "features": [
    "durable_checkpoints",
    "execution_settings_v2",
    "versioned_commands",
    "manual_sync",
    "review_packets",
    "engineering_change_set_v1"
  ],
  "extensions": {
    "vendor.example/custom-setting": true
  }
}
```

Global skills and tools apply to every advertised agent. Agent-level entries
add capabilities for that agent. Unknown vendor data belongs under
`extensions`; the Platform preserves it without using it for core routing.

Discovery runtimes may additionally advertise:

```json
{
  "features": ["engineering_change_set_v1", "engineering_state_shadow_read"],
  "extensions": {
    "yourlab.engineering/change-set-contracts": ["engineering-change-set/v1"]
  }
}
```

The runtime may read the engineering graph and submit a proposed change set. In
`remote_pull`, the Platform freezes the relevant graph snapshot in
`context.engineering.currentState` and accepts the proposal only inside the
signed connector result. In `local_push`, the equivalent typed read/propose
tools use the versioned Engineering endpoints. The runtime must not advertise
or call an engineering apply operation. Apply remains a version-checked
Platform action performed after human section review.

`engineering-change-set/v1` includes the project, Task, run and base engineering
revision; grouped entity/relationship operations; evidence; impact; questions;
and Task recommendations. Recommendations remain suggestions until separately
accepted in the canonical Tasks workflow.

An empty `agents` list is accepted for compatibility with the first runtime,
but new runtimes should advertise explicit manifests. When manifests exist,
the queue only returns packages whose agent, skills, tools, protocol ID, and
contract version are compatible.

## Frozen task package

New runtimes should consume the namespaced v2 fields:

```json
{
  "contract": {
    "id": "yourlab.agent-dispatch",
    "version": 2
  },
  "identifiers": {
    "projectId": "prj_...",
    "workItemId": "witem_...",
    "agentRequestId": "areq_...",
    "platformRunId": "prun_...",
    "agentJobId": "aj_..."
  },
  "versions": {
    "request": 1,
    "package": 1
  },
  "agent": {
    "id": "implementation-agent",
    "type": "implementation_tasks"
  },
  "instructions": "Approved task instructions",
  "context": {},
  "taskGraph": [],
  "requirements": {
    "skills": ["software_delivery"],
    "tools": ["repo.read", "repo.write", "tests.run"]
  },
  "budget": {},
  "execution": {
    "settingsVersion": 1,
    "settings": {
      "schemaVersion": 2,
      "tokenPolicy": {
        "local": { "mode": "unlimited" },
        "external": { "mode": "limited", "maxTokens": 120000 }
      },
      "checkpointPolicy": {
        "intervalSeconds": 30,
        "onStep": true,
        "beforeSideEffect": true
      },
      "planningWaveSize": 8
    }
  },
  "objective": {
    "statement": "Deliver the approved implementation unit.",
    "acceptanceCriteria": ["All approved criteria have evidence."]
  },
  "outputContract": {
    "targetOutput": "implementation_tasks_v1",
    "acceptanceCriteria": "All approved criteria pass with linked evidence.",
    "humanReviewRequired": true,
    "autoApply": false,
    "completionPolicy": {
      "stopWhenAcceptanceSatisfied": true,
      "selfReviewRequired": true,
      "maxNoProgressIterations": 3
    }
  },
  "contextSnapshotHash": "...",
  "frozenAt": "2026-07-17T00:00:00.000Z"
}
```

The Platform emits only this namespaced allowlisted envelope. The local runtime
adapter may continue reading legacy top-level aliases while older queued
packages are drained, but new integrations must not emit or depend on them.

The runtime must reject an unknown contract version. Projects hashes the exact
serialized package and verifies the same hash when accepting a result.

## Pairing and authentication

An administrator creates a ten-minute, single-use code in:

`Projects → Definições → Agent Runtime — ligação segura`

The runtime generates an Ed25519 key pair and sends only the public key to:

```text
POST /api/projects/agent-connectors/pair
```

All later connector requests include:

```text
X-YL-Connector-ID
X-YL-Timestamp
X-YL-Nonce
X-YL-Signature
```

Sign these newline-separated values:

```text
HTTP_METHOD
REQUEST_PATH
UNIX_TIMESTAMP
RANDOM_NONCE
SHA256(RAW_BODY)
```

The signature is Ed25519 encoded as base64url. The timestamp window is 60
seconds. A nonce must be random, unique, and between 16 and 128 URL-safe
characters. The Platform stores only nonce hashes.

Dispatch lease tokens are 256-bit random values returned only by `claim`.
Send the current token in `X-YL-Lease-Token` for `ack`, active-dispatch
`heartbeat`, `sync`, and `result`.

## Connector API

All signed runtime operations use POST:

```text
POST /api/projects/agent-connectors/heartbeat
POST /api/projects/agent-connectors/claim
POST /api/projects/agent-connectors/dispatches/:dispatchId/ack
POST /api/projects/agent-connectors/dispatches/:dispatchId/sync
POST /api/projects/agent-connectors/dispatches/:dispatchId/result
```

`ack` binds one non-empty `localJobId` permanently to the dispatch. `sync`
should continue sending that ID, the current status, current progress,
checkpoint, review packet when available, and up to 100 idempotent events per
batch:

```json
{
  "localJobId": "local-job-123",
  "status": "executing",
  "acknowledgedCommandVersion": 4,
  "progress": {
    "completed": 2,
    "total": 4,
    "localTokensUsed": 45000,
    "externalTokensUsed": 0,
    "phase": "running"
  },
  "checkpoint": {
    "boundary": "step_completed",
    "completedStepIds": ["step-1", "step-2"]
  },
  "events": [
    {
      "id": 7,
      "type": "verification",
      "message": "Tests passed"
    }
  ]
}
```

While a dispatch is active, heartbeat includes `dispatchId` and `localJobId`
and renews the same 60-second lease. Sync also renews it.

Valid runtime statuses are `claimed`, `running`, `planning`, `executing`,
`self_review`, `verifying`, `paused`, `cancelled`, and `failed`.

The response may contain the next monotonic `commandVersion` and
`desiredAction`: `pause`, `resume`, `cancel`, `finish_partial`, or `sync_now`.
Commands have idempotency keys and may carry a settings patch when continuing
from a paused checkpoint. A runtime acknowledges the exact command version
only after applying it or reaching the requested safe boundary. Event IDs are
idempotent within a dispatch; duplicate events are ignored.

Submit a result with:

```json
{
  "packageHash": "the hash received from claim",
  "rawOutput": "{\"valid\":\"contract output\"}"
}
```

Re-sending identical content is safe. Different content for a dispatch that
already has a result is rejected.

## Adapter boundary

A new local agent platform only needs an adapter with five responsibilities:

1. Generate and protect an Ed25519 private key.
2. Advertise a normalized capability manifest.
3. Poll, claim, and renew dispatch leases.
4. Translate a frozen task package into its native agent/job format.
5. Translate native progress and final output back into connector events and
   the declared output contract.

Provider credentials, model selection, internal checkpoints, and native agent
state remain local. The hosted Platform receives none of those unless a
declared result artifact intentionally contains them.

## Compatibility policy

- Additive fields may be introduced within a contract version.
- Existing fields cannot change meaning within the same contract version.
- Breaking changes require a new contract version.
- Runtimes advertise all supported versions during heartbeat.
- The Platform does not dispatch a package to an incompatible runtime.
- Retries preserve the original serialized package and package hash.
- Browser APIs expose dispatch status and hashes, not the frozen package,
  signatures, nonces, or lease tokens.
