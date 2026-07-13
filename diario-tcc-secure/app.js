'use strict';

const VERSION = 2;
const SECURITY_KEY = 'diarioTccSecurityV2';
const VAULT_KEY = 'diarioTccVaultV2';
const LEGACY_STORAGE_KEY = 'diarioTccEntriesV1';
const PIN_ITERATIONS = 600000;
const AUTO_LOCK_DELAY_MS = 30000;
const MAX_FAILED_ATTEMPTS = 5;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let deferredPrompt = null;
let masterKeyBytes = null;
let masterCryptoKey = null;
let entries = [];
let backgroundLockTimer = null;
let hiddenAt = 0;
let failedAttempts = Number(sessionStorage.getItem('diarioTccFailedAttempts') || 0);
let lockoutUntil = Number(sessionStorage.getItem('diarioTccLockoutUntil') || 0);
let autoLockSuspendCount = 0;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { emotion: '', trigger: '', thought: '', action: '' };

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function bytesToBase64(bytes) {
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let index = 0; index < view.length; index += 1) binary += String.fromCharCode(view[index]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  return base64ToBytes(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function securityMeta() {
  return readJson(SECURITY_KEY);
}

function setMessage(element, message, kind = '') {
  element.textContent = message;
  element.className = `form-message ${kind}`.trim();
}

function suspendAutoLock() {
  autoLockSuspendCount += 1;
}

function resumeAutoLock() {
  autoLockSuspendCount = Math.max(0, autoLockSuspendCount - 1);
}

function canAutoLockNow() {
  return Boolean(masterCryptoKey) && autoLockSuspendCount === 0;
}

async function withAutoLockSuspended(task) {
  suspendAutoLock();
  try {
    return await task();
  } finally {
    resumeAutoLock();
  }
}

async function derivePinKey(code, salt, iterations = PIN_ITERATIONS) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(code),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function importAesKey(rawBytes) {
  return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptBytes(key, plainBytes, context) {
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context), tagLength: 128 },
    key,
    plainBytes
  );
  return { iv: bytesToBase64(iv), data: bytesToBase64(encrypted) };
}

async function decryptBytes(key, payload, context) {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(payload.iv),
      additionalData: encoder.encode(context),
      tagLength: 128
    },
    key,
    base64ToBytes(payload.data)
  );
  return new Uint8Array(decrypted);
}

async function wrapMasterKey(rawMasterKey, wrappingKey, context) {
  return encryptBytes(wrappingKey, rawMasterKey, context);
}

async function unwrapMasterKey(payload, wrappingKey, context) {
  const raw = await decryptBytes(wrappingKey, payload, context);
  if (raw.length !== 32) throw new Error('Chave inválida');
  return raw;
}

async function saveVault() {
  if (!masterCryptoKey) throw new Error('Diário bloqueado');
  const payload = await encryptBytes(masterCryptoKey, encoder.encode(JSON.stringify(entries)), 'diario-tcc-vault-v2');
  writeJson(VAULT_KEY, { version: VERSION, ...payload });
}

async function loadVault() {
  if (!masterCryptoKey) throw new Error('Diário bloqueado');
  const vault = readJson(VAULT_KEY);
  if (!vault) {
    entries = [];
    await saveVault();
    return;
  }
  const plain = await decryptBytes(masterCryptoKey, vault, 'diario-tcc-vault-v2');
  const parsed = JSON.parse(decoder.decode(plain));
  if (!Array.isArray(parsed)) throw new Error('Conteúdo inválido');
  entries = parsed;
}

function setUnlockedKey(rawBytes) {
  clearUnlockedKey();
  masterKeyBytes = new Uint8Array(rawBytes);
  return importAesKey(masterKeyBytes).then((key) => {
    masterCryptoKey = key;
  });
}

function clearUnlockedKey() {
  if (masterKeyBytes) masterKeyBytes.fill(0);
  masterKeyBytes = null;
  masterCryptoKey = null;
  entries = [];
}

function showSetup() {
  document.body.classList.add('locked');
  $('#appRoot').hidden = true;
  $('#appRoot').inert = true;
  $('#authScreen').classList.remove('hidden');
  $('#setupPanel').classList.remove('hidden');
  $('#unlockPanel').classList.add('hidden');
  setMessage($('#setupMessage'), '');
  setTimeout(() => $('#setupCode').focus(), 50);
}

async function showUnlock({ autoFace = false } = {}) {
  document.body.classList.add('locked');
  $('#appRoot').hidden = true;
  $('#appRoot').inert = true;
  $('#authScreen').classList.remove('hidden');
  $('#setupPanel').classList.add('hidden');
  $('#unlockPanel').classList.remove('hidden');
  $('#unlockCode').value = '';
  setMessage($('#unlockMessage'), '');
  const meta = securityMeta();
  const faceAvailable = Boolean(meta?.faceId && await canUsePlatformAuthenticator());
  $('#faceUnlockBtn').classList.toggle('hidden', !faceAvailable);
  if (autoFace && faceAvailable) {
    setTimeout(() => unlockWithFaceId(), 150);
  } else {
    setTimeout(() => (faceAvailable ? $('#faceUnlockBtn') : $('#unlockCode')).focus(), 50);
  }
}

function showApp() {
  document.body.classList.remove('locked');
  $('#authScreen').classList.add('hidden');
  $('#authScreen').setAttribute('hidden', '');
  $('#appRoot').hidden = false;
  $('#appRoot').removeAttribute('hidden');
  $('#appRoot').inert = false;
  failedAttempts = 0;
  lockoutUntil = 0;
  sessionStorage.removeItem('diarioTccFailedAttempts');
  sessionStorage.removeItem('diarioTccLockoutUntil');
  renderInsights();
  updateSecurityUi();
  window.scrollTo(0, 0);
}

function lockApp({ autoFace = false } = {}) {
  clearTimeout(backgroundLockTimer);
  backgroundLockTimer = null;
  clearUnlockedKey();
  $('#historyList').innerHTML = '';
  $('#triggerBars').innerHTML = '';
  $('#emotionBars').innerHTML = '';
  resetForm();
  showUnlock({ autoFace });
}

function currentLockoutSeconds() {
  return Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
}

function registerFailedAttempt() {
  failedAttempts += 1;
  sessionStorage.setItem('diarioTccFailedAttempts', String(failedAttempts));
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    const exponent = Math.min(5, failedAttempts - MAX_FAILED_ATTEMPTS);
    const delaySeconds = 30 * (2 ** exponent);
    lockoutUntil = Date.now() + delaySeconds * 1000;
    sessionStorage.setItem('diarioTccLockoutUntil', String(lockoutUntil));
  }
}

async function createVault(code, enableFaceId) {
  suspendAutoLock();
  try {
    const salt = randomBytes(16);
    const pinKey = await derivePinKey(code, salt);
    const rawMaster = randomBytes(32);
    const pinWrap = await wrapMasterKey(rawMaster, pinKey, 'diario-tcc-master-pin-v2');
    const meta = {
      version: VERSION,
      createdAt: new Date().toISOString(),
      pin: { salt: bytesToBase64(salt), iterations: PIN_ITERATIONS, wrap: pinWrap },
      faceId: null
    };
    writeJson(SECURITY_KEY, meta);
    await setUnlockedKey(rawMaster);
    rawMaster.fill(0);

    const legacy = readJson(LEGACY_STORAGE_KEY);
    entries = Array.isArray(legacy) ? legacy : [];
    await saveVault();
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    showApp();

    if (enableFaceId) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      try {
        await enableFaceIdUnlock();
      } catch (error) {
        setMessage($('#securityMessage'), faceIdErrorMessage(error), 'warning');
        switchView('settings');
      }
    }
  } finally {
    resumeAutoLock();
  }
}

async function unlockWithCode(code) {
  return withAutoLockSuspended(async () => {
    const seconds = currentLockoutSeconds();
    if (seconds > 0) throw new Error(`Muitas tentativas. Aguarde ${seconds} segundos.`);
    const meta = securityMeta();
    if (!meta?.pin?.wrap) throw new Error('Configuração de segurança inválida.');
    try {
      const key = await derivePinKey(code, base64ToBytes(meta.pin.salt), meta.pin.iterations);
      const rawMaster = await unwrapMasterKey(meta.pin.wrap, key, 'diario-tcc-master-pin-v2');
      await setUnlockedKey(rawMaster);
      rawMaster.fill(0);
      await loadVault();
      showApp();
    } catch (error) {
      clearUnlockedKey();
      registerFailedAttempt();
      const wait = currentLockoutSeconds();
      if (wait > 0) throw new Error(`Código incorreto. Aguarde ${wait} segundos.`);
      throw new Error('Código incorreto.');
    }
  });
}

async function canUsePlatformAuthenticator() {
  if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) return false;
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

async function getPrfOutputForCredential(credentialId, prfSalt) {
  const credentialIdBytes = base64UrlToBytes(credentialId);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: credentialIdBytes }],
      userVerification: 'required',
      timeout: 60000,
      extensions: {
        prf: {
          evalByCredential: {
            [credentialId]: { first: prfSalt }
          }
        }
      }
    }
  });
  const result = assertion?.getClientExtensionResults?.()?.prf?.results?.first;
  if (!result) throw new Error('PRF_UNAVAILABLE');
  return new Uint8Array(result);
}

async function enableFaceIdUnlock() {
  if (!masterKeyBytes) throw new Error('Diário bloqueado');
  if (!await canUsePlatformAuthenticator()) throw new Error('FACE_UNAVAILABLE');

  const userId = randomBytes(32);
  const prfSalt = randomBytes(32);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Diário TCC' },
      user: {
        id: userId,
        name: `diario-local-${bytesToBase64Url(userId.slice(0, 8))}`,
        displayName: 'Diário TCC privado'
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 }
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required'
      },
      attestation: 'none',
      timeout: 60000,
      extensions: {
        credProps: true,
        prf: { eval: { first: prfSalt } }
      }
    }
  });

  if (!credential) throw new Error('FACE_CANCELLED');
  const credentialId = bytesToBase64Url(new Uint8Array(credential.rawId));
  let prfOutput = credential.getClientExtensionResults?.()?.prf?.results?.first;
  if (prfOutput) prfOutput = new Uint8Array(prfOutput);
  else prfOutput = await getPrfOutputForCredential(credentialId, prfSalt);

  const faceKey = await importAesKey(prfOutput);
  const faceWrap = await wrapMasterKey(masterKeyBytes, faceKey, 'diario-tcc-master-face-v2');
  prfOutput.fill(0);

  const meta = securityMeta();
  meta.faceId = {
    credentialId,
    prfSalt: bytesToBase64(prfSalt),
    wrap: faceWrap,
    enabledAt: new Date().toISOString()
  };
  writeJson(SECURITY_KEY, meta);
  updateSecurityUi();
  setMessage($('#securityMessage'), 'Face ID ativado. O código mestre continua a ser a recuperação.', 'success');
}

async function unlockWithFaceId() {
  const meta = securityMeta();
  if (!meta?.faceId) return;
  $('#faceUnlockBtn').disabled = true;
  setMessage($('#unlockMessage'), 'A aguardar confirmação no iPhone…');
  try {
    await withAutoLockSuspended(async () => {
      const prfOutput = await getPrfOutputForCredential(
        meta.faceId.credentialId,
        base64ToBytes(meta.faceId.prfSalt)
      );
      const faceKey = await importAesKey(prfOutput);
      const rawMaster = await unwrapMasterKey(meta.faceId.wrap, faceKey, 'diario-tcc-master-face-v2');
      prfOutput.fill(0);
      await setUnlockedKey(rawMaster);
      rawMaster.fill(0);
      await loadVault();
      showApp();
    });
  } catch (error) {
    clearUnlockedKey();
    setMessage($('#unlockMessage'), faceIdErrorMessage(error), 'error');
  } finally {
    $('#faceUnlockBtn').disabled = false;
  }
}

function faceIdErrorMessage(error) {
  if (error?.message === 'FACE_UNAVAILABLE') return 'Face ID não está disponível. Publique em HTTPS e abra no Safari.';
  if (error?.message === 'PRF_UNAVAILABLE') return 'Este autenticador não forneceu a chave necessária. Use o código mestre.';
  if (error?.name === 'NotAllowedError' || error?.message === 'FACE_CANCELLED') return 'Face ID cancelado. Pode usar o código mestre.';
  if (error?.name === 'InvalidStateError') return 'Já existe uma credencial semelhante. Use o código mestre ou tente noutro navegador.';
  return 'Não foi possível usar o Face ID. Use o código mestre.';
}

async function disableFaceIdUnlock() {
  const meta = securityMeta();
  if (!meta?.faceId) return;
  meta.faceId = null;
  writeJson(SECURITY_KEY, meta);
  updateSecurityUi();
  setMessage($('#securityMessage'), 'Face ID desativado nesta aplicação. A passkey pode continuar visível nas Palavras-passe do iPhone.', 'warning');
}

async function changeMasterCode(newCode) {
  if (!masterKeyBytes) throw new Error('Diário bloqueado');
  const salt = randomBytes(16);
  const key = await derivePinKey(newCode, salt);
  const wrap = await wrapMasterKey(masterKeyBytes, key, 'diario-tcc-master-pin-v2');
  const meta = securityMeta();
  meta.pin = { salt: bytesToBase64(salt), iterations: PIN_ITERATIONS, wrap };
  meta.codeChangedAt = new Date().toISOString();
  writeJson(SECURITY_KEY, meta);
}

async function updateSecurityUi() {
  const meta = securityMeta();
  const available = await canUsePlatformAuthenticator();
  if (meta?.faceId) {
    $('#faceIdStatus').textContent = 'Ativo neste endereço.';
    $('#toggleFaceId').textContent = 'Desativar';
    $('#toggleFaceId').disabled = false;
  } else if (available) {
    $('#faceIdStatus').textContent = 'Disponível neste dispositivo.';
    $('#toggleFaceId').textContent = 'Ativar';
    $('#toggleFaceId').disabled = false;
  } else {
    $('#faceIdStatus').textContent = window.isSecureContext ? 'Não disponível neste dispositivo.' : 'Requer um endereço HTTPS.';
    $('#toggleFaceId').textContent = 'Indisponível';
    $('#toggleFaceId').disabled = true;
  }
}

function selectChip(button) {
  const group = button.closest('[data-name]');
  const name = group.dataset.name;
  group.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('selected'));
  button.classList.add('selected');
  state[name] = button.dataset.value;
}

function switchView(viewId) {
  $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === viewId));
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
  if (viewId === 'history') renderHistory();
  if (viewId === 'insights') renderInsights();
  if (viewId === 'settings') updateSecurityUi();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  $('#entryForm').reset();
  $('#urge').value = 30;
  $('#urgeValue').textContent = '30';
  $('#highRiskCard').classList.add('hidden');
  Object.keys(state).forEach((key) => { state[key] = ''; });
  $$('.chip.selected').forEach((chip) => chip.classList.remove('selected'));
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function filteredEntries() {
  const days = Number($('#historyRange').value);
  const cutoff = Date.now() - days * 86400000;
  return entries.filter((entry) => new Date(entry.createdAt).getTime() >= cutoff);
}

function escapeHtml(text = '') {
  return String(text).replace(/[&<>'"]/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function renderHistory() {
  const visibleEntries = filteredEntries();
  const list = $('#historyList');
  if (!visibleEntries.length) {
    list.innerHTML = '<div class="empty">Ainda não existem registos neste período.</div>';
    return;
  }
  list.innerHTML = visibleEntries.map((entry) => `
    <article class="entry">
      <div class="entry-top">
        <div><div class="entry-meta">${formatDate(entry.createdAt)}</div><strong>${escapeHtml(entry.emotion || 'Sem emoção selecionada')}</strong></div>
        <div class="entry-score">${Number(entry.urge) || 0}</div>
      </div>
      <div class="entry-tags">
        ${[entry.trigger, entry.thought, entry.action].filter(Boolean).map((item) => `<span class="entry-tag">${escapeHtml(item)}</span>`).join('')}
      </div>
      ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ''}
      <div class="entry-actions"><button type="button" data-delete="${escapeHtml(entry.id)}">Apagar</button></div>
    </article>`).join('');
  list.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
    entries = entries.filter((entry) => entry.id !== button.dataset.delete);
    await saveVault();
    renderHistory();
  }));
}

function countsBy(items, key) {
  return items.reduce((accumulator, item) => {
    const value = item[key] || 'Não indicado';
    accumulator[value] = (accumulator[value] || 0) + 1;
    return accumulator;
  }, {});
}

function renderBars(container, counts) {
  const sorted = Object.entries(counts).sort((left, right) => right[1] - left[1]).slice(0, 6);
  if (!sorted.length) {
    container.innerHTML = '<p class="muted">Sem dados suficientes.</p>';
    return;
  }
  const max = sorted[0][1];
  container.innerHTML = sorted.map(([label, count]) => `
    <div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div><strong>${count}</strong></div>`).join('');
}

function renderInsights() {
  const average = entries.length
    ? Math.round(entries.reduce((sum, entry) => sum + Number(entry.urge || 0), 0) / entries.length)
    : 0;
  $('#statCount').textContent = String(entries.length);
  $('#statAverage').textContent = String(average);
  $('#statHigh').textContent = String(entries.filter((entry) => Number(entry.urge) >= 61).length);
  renderBars($('#triggerBars'), countsBy(entries, 'trigger'));
  renderBars($('#emotionBars'), countsBy(entries, 'emotion'));
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function encryptedBackup() {
  return {
    format: 'diario-tcc-encrypted-backup',
    version: VERSION,
    exportedAt: new Date().toISOString(),
    security: securityMeta(),
    vault: readJson(VAULT_KEY)
  };
}

function validateEncryptedBackup(parsed) {
  return parsed?.format === 'diario-tcc-encrypted-backup'
    && parsed?.version === VERSION
    && parsed?.security?.pin?.wrap
    && parsed?.vault?.data
    && parsed?.vault?.iv;
}

function restoreEncryptedBackup(parsed) {
  if (!validateEncryptedBackup(parsed)) throw new Error('Cópia inválida');
  writeJson(SECURITY_KEY, parsed.security);
  writeJson(VAULT_KEY, parsed.vault);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

$('#setupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = $('#setupCode').value.trim();
  const confirmation = $('#setupCodeConfirm').value.trim();
  if (code.length < 8) {
    setMessage($('#setupMessage'), 'Use pelo menos 8 caracteres.', 'error');
    return;
  }
  if (code !== confirmation) {
    setMessage($('#setupMessage'), 'Os códigos não coincidem.', 'error');
    return;
  }
  $('#createVaultBtn').disabled = true;
  setMessage($('#setupMessage'), 'A criar e encriptar o diário… Isto pode demorar alguns segundos no telemóvel.');
  try {
    await createVault(code, $('#setupFaceId').checked);
    $('#setupForm').reset();
  } catch (error) {
    console.error(error);
    setMessage($('#setupMessage'), 'Não foi possível criar o diário neste navegador.', 'error');
  } finally {
    $('#createVaultBtn').disabled = false;
  }
});

$('#restoreBackupAtSetup').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    restoreEncryptedBackup(parsed);
    await showUnlock();
  } catch {
    setMessage($('#setupMessage'), 'Esta não é uma cópia encriptada válida.', 'error');
  }
  event.target.value = '';
});

$('#unlockForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = $('#unlockCode').value.trim();
  $('#unlockBtn').disabled = true;
  setMessage($('#unlockMessage'), 'A desencriptar… Isto pode demorar alguns segundos no telemóvel.');
  try {
    await unlockWithCode(code);
  } catch (error) {
    setMessage($('#unlockMessage'), error.message || 'Não foi possível desbloquear.', 'error');
    $('#unlockCode').select();
  } finally {
    $('#unlockBtn').disabled = false;
  }
});

$('#faceUnlockBtn').addEventListener('click', unlockWithFaceId);
$('#lockBtn').addEventListener('click', () => lockApp({ autoFace: false }));
$('#settingsLockNow').addEventListener('click', () => lockApp({ autoFace: false }));

$$('.chip-grid.single .chip').forEach((button) => button.addEventListener('click', () => selectChip(button)));

$('#urge').addEventListener('input', (event) => {
  const value = Number(event.target.value);
  $('#urgeValue').textContent = String(value);
  $('#highRiskCard').classList.toggle('hidden', value < 61);
});

$$('.tab').forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));

$('#entryForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const urge = Number($('#urge').value);
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    urge,
    emotion: state.emotion,
    trigger: state.trigger,
    thought: state.thought,
    action: state.action,
    alternative: $('#alternative').value,
    note: $('#note').value.trim(),
    contact: $('#contactName').value.trim()
  };
  entries.unshift(entry);
  try {
    await saveVault();
    $('#savedMessage').textContent = urge >= 61
      ? 'Registo guardado. Agora execute a ação escolhida e procure apoio humano.'
      : 'Fez uma pausa e criou espaço para escolher.';
    $('#savedDialog').showModal();
  } catch {
    entries.shift();
    alert('Não foi possível guardar o registo. Desbloqueie novamente e tente de novo.');
  }
});

$('#newEntry').addEventListener('click', () => {
  $('#savedDialog').close();
  resetForm();
  switchView('quick');
});
$('#closeDialog').addEventListener('click', () => $('#savedDialog').close());

$('#historyRange').addEventListener('change', renderHistory);
$('#clearFilters').addEventListener('click', () => {
  $('#historyRange').value = '30';
  renderHistory();
});

$('#exportEncrypted').addEventListener('click', () => {
  downloadFile(
    `diario-tcc-encriptado-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(encryptedBackup(), null, 2),
    'application/json'
  );
});

$('#exportCsv').addEventListener('click', () => {
  if (!confirm('O CSV ficará legível e não será encriptado. Continuar?')) return;
  const headers = ['data_hora', 'impulso', 'emocao', 'gatilho', 'pensamento', 'acao', 'frase_realista', 'nota', 'contacto'];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = entries.map((entry) => [
    entry.createdAt, entry.urge, entry.emotion, entry.trigger, entry.thought,
    entry.action, entry.alternative, entry.note, entry.contact
  ].map(quote).join(','));
  downloadFile(
    `diario-tcc-${new Date().toISOString().slice(0, 10)}.csv`,
    `\ufeff${[headers.join(','), ...rows].join('\n')}`,
    'text/csv;charset=utf-8'
  );
});

$('#importJson').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (Array.isArray(parsed)) {
      if (!confirm('Substituir os registos atuais pelos dados deste ficheiro?')) return;
      entries = parsed;
      await saveVault();
      renderInsights();
      alert('Registos importados e encriptados com sucesso.');
    } else if (validateEncryptedBackup(parsed)) {
      if (!confirm('Esta cópia substituirá a segurança e os registos atuais. Depois terá de usar o código da cópia. Continuar?')) return;
      restoreEncryptedBackup(parsed);
      lockApp({ autoFace: false });
    } else {
      throw new Error('Formato inválido');
    }
  } catch {
    alert('Não foi possível importar este ficheiro.');
  } finally {
    event.target.value = '';
  }
});

$('#deleteAll').addEventListener('click', async () => {
  if (confirm('Apagar definitivamente todos os registos deste dispositivo?')) {
    entries = [];
    await saveVault();
    renderHistory();
    renderInsights();
  }
});

$('#toggleFaceId').addEventListener('click', async () => {
  $('#toggleFaceId').disabled = true;
  setMessage($('#securityMessage'), '');
  try {
    if (securityMeta()?.faceId) await disableFaceIdUnlock();
    else await withAutoLockSuspended(() => enableFaceIdUnlock());
  } catch (error) {
    setMessage($('#securityMessage'), faceIdErrorMessage(error), 'error');
  } finally {
    updateSecurityUi();
    $('#toggleFaceId').disabled = false;
  }
});

$('#openChangeCode').addEventListener('click', () => {
  $('#changeCodeForm').reset();
  setMessage($('#changeCodeMessage'), '');
  $('#changeCodeDialog').showModal();
  setTimeout(() => $('#newCode').focus(), 50);
});

$('#cancelChangeCode').addEventListener('click', () => $('#changeCodeDialog').close());

$('#changeCodeForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = $('#newCode').value;
  const confirmation = $('#newCodeConfirm').value;
  if (code.length < 8) {
    setMessage($('#changeCodeMessage'), 'Use pelo menos 8 caracteres.', 'error');
    return;
  }
  if (code !== confirmation) {
    setMessage($('#changeCodeMessage'), 'Os códigos não coincidem.', 'error');
    return;
  }
  try {
    await changeMasterCode(code);
    $('#changeCodeDialog').close();
    setMessage($('#securityMessage'), 'Código mestre alterado com sucesso.', 'success');
  } catch {
    setMessage($('#changeCodeMessage'), 'Não foi possível alterar o código.', 'error');
  }
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  $('#installBtn').classList.remove('hidden');
});

$('#installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('#installBtn').classList.add('hidden');
});

window.addEventListener('pagehide', () => {
  if (canAutoLockNow()) lockApp({ autoFace: false });
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && canAutoLockNow()) {
    hiddenAt = Date.now();
    clearTimeout(backgroundLockTimer);
    backgroundLockTimer = setTimeout(() => {
      if (canAutoLockNow()) lockApp({ autoFace: false });
    }, AUTO_LOCK_DELAY_MS);
    return;
  }

  if (!document.hidden) {
    const wasAwayLongEnough = hiddenAt > 0 && (Date.now() - hiddenAt) >= AUTO_LOCK_DELAY_MS;
    clearTimeout(backgroundLockTimer);
    backgroundLockTimer = null;
    hiddenAt = 0;
    if (wasAwayLongEnough && canAutoLockNow()) lockApp({ autoFace: false });
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = window.location.pathname.includes('/diario-tcc-secure')
      ? '/diario-tcc-secure/sw.js'
      : './sw.js';
    navigator.serviceWorker.register(swUrl, {
      scope: window.location.pathname.includes('/diario-tcc-secure') ? '/diario-tcc-secure/' : './',
    });
  });
}

async function initialize() {
  if (!window.crypto?.subtle) {
    showSetup();
    setMessage($('#setupMessage'), 'Este navegador não suporta a encriptação necessária. Use o Safari atualizado.', 'error');
    $('#createVaultBtn').disabled = true;
    return;
  }
  if (securityMeta()) await showUnlock({ autoFace: true });
  else showSetup();
}

initialize();
