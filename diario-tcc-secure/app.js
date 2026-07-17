'use strict';

const VERSION = 2;
const APP_BUILD = 9;
const SECURITY_KEY = 'diarioTccSecurityV2';
const VAULT_KEY = 'diarioTccVaultV2';
const LEGACY_STORAGE_KEY = 'diarioTccEntriesV1';
const BACKUP_PREFS_KEY = 'diarioTccBackupPrefsV1';
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
let dailyBackupPromptShown = false;
let otherDialogResolver = null;
let otherDialogContext = null;
let lastChipTapAt = 0;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const bind = (element, eventName, handler) => {
  if (element) element.addEventListener(eventName, handler);
};
const state = {
  mood: '',
  triggers: [],
  actions: [],
  thoughts: [],
  company: [],
  sleep: '',
  intimacy: ''
};
const otherText = {
  mood: '',
  triggers: '',
  actions: '',
  thoughts: '',
  company: ''
};
const OTHER_MARKER = 'Outro';
const SLIP_ACTION = 'Usei o atalho';
const HEALTHY_ACTIONS = new Set([
  'Orei',
  'Conversei com a minha esposa',
  'Saí para caminhar',
  'Fiz exercício físico',
  'Li algo edificante',
  'Procurei um amigo de confiança',
  'Investi em intimidade / proximidade'
]);

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

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function defaultBackupPrefs() {
  return {
    afterEachEntry: true,
    daily: true,
    lastBackupDay: null
  };
}

function backupPrefs() {
  const stored = readJson(BACKUP_PREFS_KEY);
  return { ...defaultBackupPrefs(), ...(stored && typeof stored === 'object' ? stored : {}) };
}

function saveBackupPrefs(prefs) {
  writeJson(BACKUP_PREFS_KEY, prefs);
}

function formatBackupDay(day) {
  if (!day) return 'Ainda não descarregou nenhuma cópia neste dispositivo.';
  try {
    return `Última cópia: ${new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium' }).format(new Date(`${day}T12:00:00`))}.`;
  } catch {
    return `Última cópia: ${day}.`;
  }
}

function updateBackupUi() {
  const prefs = backupPrefs();
  const afterEntry = $('#backupAfterEntry');
  const daily = $('#backupDaily');
  if (afterEntry) afterEntry.checked = Boolean(prefs.afterEachEntry);
  if (daily) daily.checked = Boolean(prefs.daily);
  const status = $('#backupStatus');
  if (status) setMessage(status, formatBackupDay(prefs.lastBackupDay));
}

function markBackupDownloaded() {
  const prefs = backupPrefs();
  prefs.lastBackupDay = todayKey();
  saveBackupPrefs(prefs);
  updateBackupUi();
}

function needsDailyBackup() {
  const prefs = backupPrefs();
  return Boolean(prefs.daily) && prefs.lastBackupDay !== todayKey();
}

function maybePromptDailyBackup() {
  if (dailyBackupPromptShown || !needsDailyBackup() || !masterCryptoKey) return;
  const dialog = $('#dailyBackupDialog');
  if (!dialog || dialog.open || $('#savedDialog')?.open) return;
  dailyBackupPromptShown = true;
  dialog.showModal();
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
  updateBackupUi();
  updateAppBuildUi();
  updateEntryDateLabel();
  window.scrollTo(0, 0);
  window.setTimeout(maybePromptDailyBackup, 450);
}

function lockApp({ autoFace = false } = {}) {
  clearTimeout(backgroundLockTimer);
  backgroundLockTimer = null;
  clearUnlockedKey();
  dailyBackupPromptShown = false;
  $('#historyList').innerHTML = '';
  $('#triggerBars').innerHTML = '';
  $('#emotionBars').innerHTML = '';
  const actionBars = $('#actionBars');
  if (actionBars) actionBars.innerHTML = '';
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
  handleChipPress(button);
}

function syncChipStateFromGroup(group) {
  const name = group.dataset.name;
  if (!name) return;
  if (group.classList.contains('multi')) {
    state[name] = [...group.querySelectorAll('.chip.selected')].map((chip) => chip.dataset.value);
  }
}

function otherPreviewId(name) {
  return name === 'mood' ? '#moodOtherPreview' : `#${name}OtherPreview`;
}

function updateOtherPreview(name) {
  const preview = $(otherPreviewId(name));
  if (!preview) return;
  const text = String(otherText[name] || '').trim();
  if (text) {
    preview.textContent = `Outro: ${text}`;
    preview.classList.remove('hidden');
  } else {
    preview.textContent = '';
    preview.classList.add('hidden');
  }
}

function setOtherText(name, value) {
  otherText[name] = String(value || '').trim();
  updateOtherPreview(name);
}

function moodLabel() {
  if (state.mood === OTHER_MARKER && otherText.mood) return `Outro: ${otherText.mood}`;
  return state.mood;
}

function openOtherInputDialog({ title, hint, label, placeholder, initial = '' }) {
  return new Promise((resolve) => {
    otherDialogResolver = resolve;
    $('#otherInputTitle').textContent = title;
    $('#otherInputHint').textContent = hint;
    $('#otherInputLabel').textContent = label;
    $('#otherInputValue').placeholder = placeholder;
    $('#otherInputValue').value = initial;
    setMessage($('#otherInputMessage'), '');
    $('#otherInputDialog').showModal();
    window.setTimeout(() => {
      $('#otherInputValue').focus();
      $('#otherInputValue').select();
    }, 80);
  });
}

function closeOtherInputDialog(result) {
  const resolver = otherDialogResolver;
  otherDialogResolver = null;
  otherDialogContext = null;
  $('#otherInputDialog').close();
  if (resolver) resolver(result);
}

function handleChipPress(button) {
  const group = button.closest('[data-name]');
  if (!group) return;
  const name = group.dataset.name;
  const value = button.dataset.value;
  const multi = group.classList.contains('multi');
  const isOther = value === OTHER_MARKER;
  const wasSelected = button.classList.contains('selected');

  if (multi) {
    if (isOther && wasSelected) {
      openOtherInputDialog({
        title: otherDialogCopy(name).title,
        hint: otherDialogCopy(name).hint,
        label: otherDialogCopy(name).label,
        placeholder: otherDialogCopy(name).placeholder,
        initial: otherText[name]
      }).then((text) => {
        if (!text) {
          button.classList.remove('selected');
          setOtherText(name, '');
        } else {
          setOtherText(name, text);
        }
        syncChipStateFromGroup(group);
        if (name === 'actions') updateSlipVisibility();
      });
      return;
    }

    if (isOther && !wasSelected) {
      otherDialogContext = { button, group, name, multi: true };
      openOtherInputDialog({
        title: otherDialogCopy(name).title,
        hint: otherDialogCopy(name).hint,
        label: otherDialogCopy(name).label,
        placeholder: otherDialogCopy(name).placeholder,
        initial: otherText[name]
      }).then((text) => {
        if (!text) return;
        button.classList.add('selected');
        setOtherText(name, text);
        syncChipStateFromGroup(group);
        if (name === 'actions') updateSlipVisibility();
      });
      return;
    }

    button.classList.toggle('selected');
    syncChipStateFromGroup(group);
    if (name === 'actions') updateSlipVisibility();
    return;
  }

  if (isOther) {
    if (wasSelected) {
      openOtherInputDialog({
        title: otherDialogCopy(name).title,
        hint: otherDialogCopy(name).hint,
        label: otherDialogCopy(name).label,
        placeholder: otherDialogCopy(name).placeholder,
        initial: otherText[name]
      }).then((text) => {
        if (!text) {
          button.classList.remove('selected');
          state[name] = '';
          setOtherText(name, '');
          return;
        }
        setOtherText(name, text);
        state[name] = OTHER_MARKER;
      });
      return;
    }

    otherDialogContext = { button, group, name, multi: false };
    openOtherInputDialog({
      title: otherDialogCopy(name).title,
      hint: otherDialogCopy(name).hint,
      label: otherDialogCopy(name).label,
      placeholder: otherDialogCopy(name).placeholder,
      initial: otherText[name]
    }).then((text) => {
      if (!text) return;
      group.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('selected'));
      button.classList.add('selected');
      state[name] = OTHER_MARKER;
      setOtherText(name, text);
    });
    return;
  }

  group.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('selected'));
  button.classList.add('selected');
  state[name] = value;
  if (group.dataset.other) setOtherText(name, '');
}

function otherDialogCopy(name) {
  const copy = {
    mood: {
      title: 'Como se sente?',
      hint: 'Descreva o seu estado com as suas palavras.',
      label: 'Estado de hoje',
      placeholder: 'Ex.: inquieto, esperançoso, culpado…'
    },
    triggers: {
      title: 'Outro gatilho',
      hint: 'O que mais despertou a vontade hoje?',
      label: 'Gatilho',
      placeholder: 'Descreva o gatilho…'
    },
    actions: {
      title: 'Outra resposta',
      hint: 'O que fez diante da vontade?',
      label: 'Resposta',
      placeholder: 'Descreva o que fez…'
    },
    thoughts: {
      title: 'Outro pensamento',
      hint: 'Que pensamento automático apareceu?',
      label: 'Pensamento',
      placeholder: 'Descreva o pensamento…'
    },
    company: {
      title: 'Com quem mais estava?',
      hint: 'Descreva o contexto social.',
      label: 'Pessoas / contexto',
      placeholder: 'Ex.: colegas, sozinho no quarto…'
    }
  };
  return copy[name] || {
    title: 'Descreva',
    hint: 'Escreva com as suas palavras.',
    label: 'Descrição',
    placeholder: 'O que sentiu ou aconteceu?'
  };
}

function initChipDelegation() {
  const root = document.body;
  if (!root || root.dataset.chipsReady) return;
  root.dataset.chipsReady = '1';

  const onChipEvent = (event) => {
    const button = event.target.closest('button.chip');
    if (!button || !button.closest('#entryForm')) return;
    const now = Date.now();
    if (now - lastChipTapAt < 280) return;
    lastChipTapAt = now;
    if (event.cancelable) event.preventDefault();
    handleChipPress(button);
  };

  root.addEventListener('click', onChipEvent, true);
  root.addEventListener('touchend', onChipEvent, { capture: true, passive: false });
}

function toggleOtherField(marker, selected, inputSelector, labelSelector) {
  const show = selected.includes(marker);
  const input = $(inputSelector);
  const label = $(labelSelector);
  if (input) input.classList.toggle('hidden', !show);
  if (label) label.classList.toggle('hidden', !show);
  if (!show && input) input.value = '';
}

function updateSlipVisibility() {
  const show = state.actions.includes(SLIP_ACTION);
  $('#slipCard').classList.toggle('hidden', !show);
}

function updateEntryDateLabel() {
  const label = $('#entryDateLabel');
  if (!label) return;
  label.textContent = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date());
}

function normalizeUrge(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number > 10) return Math.min(10, Math.round(number / 10));
  return Math.max(0, Math.min(10, number));
}

function entryTriggers(entry) {
  if (Array.isArray(entry.triggers) && entry.triggers.length) return entry.triggers;
  if (entry.trigger) return [entry.trigger];
  return [];
}

function entryActions(entry) {
  if (Array.isArray(entry.actions) && entry.actions.length) return entry.actions;
  if (entry.action) return [entry.action];
  return [];
}

function entryMood(entry) {
  return entry.mood || entry.emotion || '';
}

function entryThoughts(entry) {
  if (Array.isArray(entry.thoughts) && entry.thoughts.length) return entry.thoughts;
  if (entry.thought) return [entry.thought];
  return [];
}

function entryCompany(entry) {
  if (Array.isArray(entry.company) && entry.company.length) return entry.company;
  return [];
}

function resolvedMood() {
  if (state.mood === OTHER_MARKER && otherText.mood) return `Outro: ${otherText.mood}`;
  return state.mood;
}

function entryDayKey(entry) {
  const iso = entry?.createdAt;
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

function entriesForDay(dayKey) {
  return entries
    .filter((entry) => entryDayKey(entry) === dayKey)
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function joinList(values, empty = '—') {
  const list = uniqueValues(values);
  return list.length ? list.join('; ') : empty;
}

function formatReportDay(dayKey) {
  try {
    return new Intl.DateTimeFormat('pt-PT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(`${dayKey}T12:00:00`));
  } catch {
    return dayKey;
  }
}

function formatEntryClock(entry) {
  if (entry.urgeTime) return entry.urgeTime;
  try {
    return new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' }).format(new Date(entry.createdAt));
  } catch {
    return '—';
  }
}

function line(label, value) {
  const text = String(value || '').trim();
  return text ? `${label}: ${text}` : null;
}

function buildEntryDetail(entry, index, showIndex) {
  const prefix = showIndex ? `${index}) ` : '';
  const lines = [
    `${prefix}${formatEntryClock(entry)}`,
    line('Estado', entryMood(entry)),
    line('Vontade do atalho', `${normalizeUrge(entry.urge)}/10`),
    line('Gatilhos', entryTriggers(entry).join('; ')),
    line('Horário da vontade', entry.urgeTime || ''),
    line('Respostas', entryActions(entry).join('; ')),
    line('Pensamentos', entryThoughts(entry).join('; ')),
    line('Onde estava', entry.locationNote),
    line('Com quem estava', entryCompany(entry).join('; ')),
    line('Sono', entry.sleep),
    line('Proximidade conjugal', entry.intimacy),
    line('Antes do deslize', entry.slipBefore),
    line('Depois do deslize', entry.slipAfter),
    line('Próxima vez', entry.slipNext),
    line('Positivo do dia', entry.positiveAct),
    line('Gratidão', entry.gratitude),
    line('Meta para amanhã', entry.tomorrowGoal),
    line('Nota livre', entry.freeNote || entry.note),
    line('Pessoa de apoio', entry.contact)
  ].filter(Boolean);
  return lines.join('\n');
}

function buildDailyReport(dayKey) {
  const dayEntries = entriesForDay(dayKey);
  const title = `Relatório diário — ${formatReportDay(dayKey)}`;
  if (!dayEntries.length) {
    return `${title}\n\nSem registos neste dia.`;
  }

  const scores = dayEntries.map((entry) => normalizeUrge(entry.urge));
  const avg = Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const slips = dayEntries.filter((entry) => entryActions(entry).includes(SLIP_ACTION) || entry.hadSlip).length;
  const healthy = dayEntries.filter((entry) => entryActions(entry).some((action) => HEALTHY_ACTIONS.has(action))).length;
  const multiple = dayEntries.length > 1;

  const summary = [
    'RESUMO DO DIA',
    `Registos: ${dayEntries.length}`,
    multiple
      ? `Vontade do atalho: média ${avg}/10 (mín ${min}, máx ${max})`
      : `Vontade do atalho: ${scores[0]}/10`,
    `Estados: ${joinList(dayEntries.map(entryMood))}`,
    `Gatilhos: ${joinList(dayEntries.flatMap(entryTriggers))}`,
    `Respostas: ${joinList(dayEntries.flatMap(entryActions))}`,
    `Respostas saudáveis (registos): ${healthy}`,
    `Deslizes (registos): ${slips}`,
    `Positivos: ${joinList(dayEntries.map((entry) => entry.positiveAct))}`,
    `Gratidões: ${joinList(dayEntries.map((entry) => entry.gratitude))}`
  ].join('\n');

  const details = dayEntries
    .map((entry, index) => buildEntryDetail(entry, index + 1, multiple))
    .join('\n\n');

  const footer = [
    '',
    '---',
    'Nota: “atalho” e “deslize” são termos discretos do acompanhamento.',
    'Foco do dia: reforçar hábitos, intimidade e autocontrolo.'
  ].join('\n');

  if (multiple) {
    return `${title}\n\n${summary}\n\nDETALHE DOS REGISTOS\n\n${details}${footer}`;
  }
  return `${title}\n\n${summary}\n\nDETALHE\n\n${details}${footer}`;
}

function refreshDailyReportText() {
  const dayKey = $('#reportDay')?.value || todayKey();
  const text = buildDailyReport(dayKey);
  $('#reportText').value = text;
  const hasEntries = entriesForDay(dayKey).length > 0;
  $('#copyReport').disabled = !hasEntries;
  $('#shareReport').disabled = !hasEntries;
  $('#downloadReport').disabled = !hasEntries;
  if (!hasEntries) setMessage($('#reportMessage'), 'Não há registos neste dia.', 'warning');
  else setMessage($('#reportMessage'), '');
  return text;
}

function openDailyReportDialog(dayKey = todayKey()) {
  $('#reportDay').value = dayKey;
  refreshDailyReportText();
  setMessage($('#reportMessage'), '');
  $('#dailyReportDialog').showModal();
  $('#shareReport').classList.toggle('hidden', typeof navigator.share !== 'function');
}

async function copyDailyReport() {
  const text = $('#reportText').value;
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      $('#reportText').focus();
      $('#reportText').select();
      document.execCommand('copy');
    }
    setMessage($('#reportMessage'), 'Texto copiado. Pode colar na mensagem para a terapeuta.', 'success');
  } catch {
    setMessage($('#reportMessage'), 'Não foi possível copiar. Selecione o texto e copie manualmente.', 'error');
  }
}

async function shareDailyReport() {
  const text = $('#reportText').value;
  const dayKey = $('#reportDay').value || todayKey();
  if (!text || typeof navigator.share !== 'function') return;
  try {
    await withAutoLockSuspended(() => navigator.share({
      title: `Relatório diário ${dayKey}`,
      text
    }));
    setMessage($('#reportMessage'), 'Partilha concluída.', 'success');
  } catch (error) {
    if (error?.name === 'AbortError') return;
    setMessage($('#reportMessage'), 'Não foi possível partilhar. Use Copiar texto.', 'error');
  }
}

function downloadDailyReport() {
  const dayKey = $('#reportDay').value || todayKey();
  const text = $('#reportText').value;
  if (!text) return;
  downloadFile(`relatorio-diario-${dayKey}.txt`, text, 'text/plain;charset=utf-8');
  setMessage($('#reportMessage'), 'Ficheiro .txt descarregado.', 'success');
}

function resolveListWithOther(selected, otherValue, marker = OTHER_MARKER) {
  return selected.map((item) => {
    if (item !== marker) return item;
    const detail = String(otherValue || '').trim();
    return detail ? `Outro: ${detail}` : 'Outro';
  });
}

function switchView(viewId) {
  $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === viewId));
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
  if (viewId === 'quick') updateEntryDateLabel();
  if (viewId === 'history') renderHistory();
  if (viewId === 'insights') renderInsights();
  if (viewId === 'settings') {
    updateSecurityUi();
    updateBackupUi();
    updateAppBuildUi();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  const form = $('#entryForm');
  if (form) form.reset();
  $('#urge').value = 3;
  $('#urgeValue').textContent = '3';
  $('#highRiskCard').classList.add('hidden');
  $('#slipCard').classList.add('hidden');
  state.mood = '';
  state.triggers = [];
  state.actions = [];
  state.thoughts = [];
  state.company = [];
  state.sleep = '';
  state.intimacy = '';
  Object.keys(otherText).forEach((key) => { otherText[key] = ''; });
  $$('.chip.selected').forEach((chip) => chip.classList.remove('selected'));
  Object.keys(otherText).forEach((name) => updateOtherPreview(name));
  updateEntryDateLabel();
}

function updateAppBuildUi() {
  const label = $('#appBuildLabel');
  if (label) label.textContent = String(APP_BUILD);
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
  list.innerHTML = visibleEntries.map((entry) => {
    const mood = entryMood(entry) || 'Sem estado indicado';
    const tags = [
      ...entryTriggers(entry),
      ...entryActions(entry),
      entry.urgeTime ? `Horário ${entry.urgeTime}` : ''
    ].filter(Boolean);
    const extras = [
      entry.positiveAct ? `<p><strong>Positivo:</strong> ${escapeHtml(entry.positiveAct)}</p>` : '',
      entry.gratitude ? `<p><strong>Gratidão:</strong> ${escapeHtml(entry.gratitude)}</p>` : '',
      entryThoughts(entry).length ? `<p><strong>Pensamentos:</strong> ${escapeHtml(entryThoughts(entry).join('; '))}</p>` : '',
      entry.locationNote ? `<p><strong>Onde:</strong> ${escapeHtml(entry.locationNote)}</p>` : '',
      entryCompany(entry).length ? `<p><strong>Com quem:</strong> ${escapeHtml(entryCompany(entry).join('; '))}</p>` : '',
      entry.sleep ? `<p><strong>Sono:</strong> ${escapeHtml(entry.sleep)}</p>` : '',
      entry.intimacy ? `<p><strong>Proximidade:</strong> ${escapeHtml(entry.intimacy)}</p>` : '',
      entry.tomorrowGoal ? `<p><strong>Meta amanhã:</strong> ${escapeHtml(entry.tomorrowGoal)}</p>` : '',
      entry.slipBefore ? `<p><strong>Antes:</strong> ${escapeHtml(entry.slipBefore)}</p>` : '',
      entry.slipAfter ? `<p><strong>Depois:</strong> ${escapeHtml(entry.slipAfter)}</p>` : '',
      entry.slipNext ? `<p><strong>Próxima vez:</strong> ${escapeHtml(entry.slipNext)}</p>` : '',
      (entry.freeNote || entry.note) ? `<p>${escapeHtml(entry.freeNote || entry.note)}</p>` : ''
    ].join('');
    return `
    <article class="entry">
      <div class="entry-top">
        <div><div class="entry-meta">${formatDate(entry.createdAt)}</div><strong>${escapeHtml(mood)}</strong></div>
        <div class="entry-score">${normalizeUrge(entry.urge)}</div>
      </div>
      <div class="entry-tags">
        ${tags.map((item) => `<span class="entry-tag">${escapeHtml(item)}</span>`).join('')}
      </div>
      ${extras}
      <div class="entry-actions"><button type="button" data-delete="${escapeHtml(entry.id)}">Apagar</button></div>
    </article>`;
  }).join('');
  list.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
    entries = entries.filter((entry) => entry.id !== button.dataset.delete);
    await saveVault();
    renderHistory();
    renderInsights();
  }));
}

function countsBy(items, key) {
  return items.reduce((accumulator, item) => {
    const value = item[key] || 'Não indicado';
    accumulator[value] = (accumulator[value] || 0) + 1;
    return accumulator;
  }, {});
}

function countsByList(items, getter) {
  return items.reduce((accumulator, item) => {
    const values = getter(item);
    if (!values.length) {
      accumulator['Não indicado'] = (accumulator['Não indicado'] || 0) + 1;
      return accumulator;
    }
    values.forEach((value) => {
      accumulator[value] = (accumulator[value] || 0) + 1;
    });
    return accumulator;
  }, {});
}

function renderBars(container, counts) {
  if (!container) return;
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
  const scores = entries.map((entry) => normalizeUrge(entry.urge));
  const average = scores.length
    ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10
    : 0;
  const healthyCount = entries.filter((entry) => entryActions(entry).some((action) => HEALTHY_ACTIONS.has(action))).length;
  const slips = entries.filter((entry) => entryActions(entry).includes(SLIP_ACTION) || entry.hadSlip).length;
  const withGratitude = entries.filter((entry) => String(entry.gratitude || '').trim()).length;

  $('#statCount').textContent = String(entries.length);
  $('#statAverage').textContent = String(average);
  $('#statHigh').textContent = String(scores.filter((score) => score >= 7).length);
  const habitsEl = $('#statHabits');
  const slipsEl = $('#statSlips');
  const gratitudeEl = $('#statGratitude');
  if (habitsEl) habitsEl.textContent = String(healthyCount);
  if (slipsEl) slipsEl.textContent = String(slips);
  if (gratitudeEl) gratitudeEl.textContent = String(withGratitude);

  renderBars($('#triggerBars'), countsByList(entries, entryTriggers));
  renderBars($('#emotionBars'), countsBy(entries.map((entry) => ({ mood: entryMood(entry) })), 'mood'));
  renderBars($('#actionBars'), countsByList(entries, entryActions));
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

function downloadEncryptedBackup() {
  downloadFile(
    `diario-tcc-encriptado-${todayKey()}.json`,
    JSON.stringify(encryptedBackup(), null, 2),
    'application/json'
  );
  markBackupDownloaded();
}

function validateEncryptedBackup(parsed) {
  return parsed?.format === 'diario-tcc-encrypted-backup'
    && Number(parsed?.version) === VERSION
    && parsed?.security?.pin?.wrap?.data
    && parsed?.security?.pin?.wrap?.iv
    && parsed?.vault?.data
    && parsed?.vault?.iv;
}

function restoreEncryptedBackup(parsed) {
  if (!validateEncryptedBackup(parsed)) throw new Error('Cópia inválida');
  writeJson(SECURITY_KEY, parsed.security);
  writeJson(VAULT_KEY, parsed.vault);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  clearUnlockedKey();
}

function describeBackupError(error, rawText) {
  if (error instanceof SyntaxError) return 'O ficheiro não é um JSON válido.';
  if (String(rawText || '').includes('diario-tcc-encrypted-backup')) {
    return 'Esta cópia parece antiga ou incompleta. Use uma exportação encriptada desta versão (v2).';
  }
  return 'Esta não é uma cópia encriptada válida. Escolha o ficheiro JSON exportado pela app.';
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
  let rawText = '';
  try {
    rawText = await file.text();
    const parsed = JSON.parse(rawText);
    restoreEncryptedBackup(parsed);
    setMessage($('#setupMessage'), '');
    await showUnlock();
    setMessage($('#unlockMessage'), 'Cópia recuperada. Introduza o código mestre desta cópia para desbloquear.', 'success');
  } catch (error) {
    setMessage($('#setupMessage'), describeBackupError(error, rawText), 'error');
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

initChipDelegation();

bind($('#otherInputForm'), 'submit', (event) => {
  event.preventDefault();
  const text = $('#otherInputValue').value.trim();
  if (!text) {
    setMessage($('#otherInputMessage'), 'Escreva algumas palavras para guardar.', 'error');
    return;
  }
  closeOtherInputDialog(text);
});

bind($('#cancelOtherInput'), 'click', () => {
  closeOtherInputDialog(null);
});

$('#otherInputDialog')?.addEventListener('close', () => {
  if (otherDialogResolver) closeOtherInputDialog(null);
});

bind($('#urge'), 'input', (event) => {
  const value = Number(event.target.value);
  $('#urgeValue').textContent = String(value);
  $('#highRiskCard').classList.toggle('hidden', value < 7);
});

$$('.tab').forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));

$('#entryForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const urge = normalizeUrge($('#urge').value);
  const triggers = resolveListWithOther(state.triggers, otherText.triggers);
  const actions = resolveListWithOther(state.actions, otherText.actions);
  const thoughts = resolveListWithOther(state.thoughts, otherText.thoughts);
  const company = resolveListWithOther(state.company, otherText.company);
  const hadSlip = actions.includes(SLIP_ACTION);
  const mood = resolvedMood();
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    formVersion: 4,
    urge,
    mood,
    emotion: mood,
    triggers,
    trigger: triggers[0] || '',
    urgeTime: $('#urgeTime').value || '',
    actions,
    action: actions[0] || '',
    thoughts,
    thought: thoughts[0] || '',
    locationNote: $('#locationNote').value.trim(),
    company,
    sleep: state.sleep,
    intimacy: state.intimacy,
    hadSlip,
    slipBefore: hadSlip ? $('#slipBefore').value.trim() : '',
    slipAfter: hadSlip ? $('#slipAfter').value.trim() : '',
    slipNext: hadSlip ? $('#slipNext').value.trim() : '',
    positiveAct: $('#positiveAct').value.trim(),
    gratitude: $('#gratitude').value.trim(),
    tomorrowGoal: $('#tomorrowGoal').value.trim(),
    freeNote: $('#freeNote').value.trim(),
    contact: $('#contactName').value.trim(),
    note: $('#freeNote').value.trim()
  };
  entries.unshift(entry);
  try {
    await saveVault();
    if (hadSlip) {
      $('#savedMessage').textContent = 'Registo guardado. O deslize não apaga o progresso — use o que aprendeu e volte aos hábitos que constroem intimidade e autocontrolo.';
    } else if (urge >= 7) {
      $('#savedMessage').textContent = 'Registo guardado. A vontade é forte; prefira proximidade, movimento ou apoio humano agora.';
    } else if (entry.positiveAct || entry.gratitude) {
      $('#savedMessage').textContent = 'Registo guardado. Cada hábito positivo e cada gratidão reforçam a vida que quer construir.';
    } else {
      $('#savedMessage').textContent = 'Registo guardado. Continuar a observar já é um passo de autocontrolo.';
    }
    const backupNote = $('#savedBackupNote');
    if (backupPrefs().afterEachEntry) {
      try {
        downloadEncryptedBackup();
        backupNote.textContent = 'Cópia encriptada descarregada. Guarde-a fora do navegador para poder recuperar noutro dispositivo.';
        backupNote.classList.remove('hidden');
      } catch {
        backupNote.textContent = 'Não foi possível descarregar a cópia automática. Use Dados → Exportar cópia encriptada.';
        backupNote.classList.remove('hidden');
      }
    } else {
      backupNote.textContent = '';
      backupNote.classList.add('hidden');
    }
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

bind($('#openDailyReport'), 'click', () => openDailyReportDialog(todayKey()));
bind($('#openDailyReportFromSettings'), 'click', () => openDailyReportDialog(todayKey()));
bind($('#reportDay'), 'change', () => {
  refreshDailyReportText();
});
bind($('#copyReport'), 'click', () => {
  copyDailyReport();
});
bind($('#shareReport'), 'click', () => {
  shareDailyReport();
});
bind($('#downloadReport'), 'click', () => {
  downloadDailyReport();
});
bind($('#closeDailyReport'), 'click', () => {
  $('#dailyReportDialog').close();
});

bind($('#exportEncrypted'), 'click', () => {
  downloadEncryptedBackup();
});

bind($('#backupAfterEntry'), 'change', (event) => {
  const prefs = backupPrefs();
  prefs.afterEachEntry = event.target.checked;
  saveBackupPrefs(prefs);
  updateBackupUi();
});

bind($('#backupDaily'), 'change', (event) => {
  const prefs = backupPrefs();
  prefs.daily = event.target.checked;
  saveBackupPrefs(prefs);
  updateBackupUi();
  if (prefs.daily) {
    dailyBackupPromptShown = false;
    maybePromptDailyBackup();
  }
});

$('#confirmDailyBackup').addEventListener('click', () => {
  downloadEncryptedBackup();
  $('#dailyBackupDialog').close();
});

$('#skipDailyBackup').addEventListener('click', () => {
  $('#dailyBackupDialog').close();
});

bind($('#exportCsv'), 'click', () => {
  if (!confirm('O CSV ficará legível e não será encriptado. Continuar?')) return;
  const headers = [
    'data_hora', 'estado', 'vontade_atalho', 'gatilhos', 'horario_vontade', 'respostas',
    'pensamentos', 'onde', 'com_quem', 'sono', 'proximidade', 'deslize', 'antes', 'depois',
    'proxima_vez', 'positivo', 'gratidao', 'meta_amanha', 'nota_livre', 'contacto'
  ];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = entries.map((entry) => [
    entry.createdAt,
    entryMood(entry),
    normalizeUrge(entry.urge),
    entryTriggers(entry).join(' | '),
    entry.urgeTime || '',
    entryActions(entry).join(' | '),
    entryThoughts(entry).join(' | '),
    entry.locationNote || '',
    entryCompany(entry).join(' | '),
    entry.sleep || '',
    entry.intimacy || '',
    entry.hadSlip || entryActions(entry).includes(SLIP_ACTION) ? 'sim' : 'nao',
    entry.slipBefore || '',
    entry.slipAfter || '',
    entry.slipNext || '',
    entry.positiveAct || '',
    entry.gratitude || '',
    entry.tomorrowGoal || '',
    entry.freeNote || entry.note || '',
    entry.contact || ''
  ].map(quote).join(','));
  downloadFile(
    `diario-tcc-${todayKey()}.csv`,
    `\ufeff${[headers.join(','), ...rows].join('\n')}`,
    'text/csv;charset=utf-8'
  );
});

$('#importJson').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  let rawText = '';
  try {
    rawText = await file.text();
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      if (!confirm('Substituir os registos atuais pelos dados deste ficheiro?')) return;
      entries = parsed;
      await saveVault();
      renderInsights();
      renderHistory();
      alert('Registos importados e encriptados com sucesso.');
    } else if (validateEncryptedBackup(parsed)) {
      if (!confirm('Esta cópia substituirá a segurança e os registos atuais. Depois terá de usar o código mestre da cópia. Continuar?')) return;
      restoreEncryptedBackup(parsed);
      lockApp({ autoFace: false });
      setMessage($('#unlockMessage'), 'Cópia recuperada. Introduza o código mestre desta cópia.', 'success');
    } else {
      throw new Error('Formato inválido');
    }
  } catch (error) {
    alert(describeBackupError(error, rawText));
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
  initChipDelegation();
  updateAppBuildUi();
  if (!window.crypto?.subtle) {
    showSetup();
    setMessage($('#setupMessage'), 'Este navegador não suporta a encriptação necessária. Use o Safari atualizado.', 'error');
    const createBtn = $('#createVaultBtn');
    if (createBtn) createBtn.disabled = true;
    return;
  }
  if (securityMeta()) await showUnlock({ autoFace: true });
  else showSetup();
}

initialize();
