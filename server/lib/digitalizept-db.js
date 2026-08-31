/**
 * SQLite store for the Digitalize Portugal sales app.
 * One file, one vendedor (owner) for now — see 06 · Plano de Execução da Plataforma on Notion.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'digitalizept.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lead (
    id TEXT PRIMARY KEY,
    business_type TEXT NOT NULL,
    nome TEXT NOT NULL DEFAULT '',
    morada TEXT NOT NULL DEFAULT '',
    telefone TEXT NOT NULL DEFAULT '',
    whatsapp TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'novo',
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dados_negocio (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL REFERENCES lead(id),
    obrigatorios_json TEXT NOT NULL DEFAULT '{}',
    opcionais_json TEXT NOT NULL DEFAULT '{}',
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS servico (
    id TEXT PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    descricao_cliente TEXT NOT NULL DEFAULT '',
    preco_centimos INTEGER NOT NULL DEFAULT 0,
    percentual REAL,
    tipo TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    ordem INTEGER NOT NULL DEFAULT 0,
    admin_edited INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS proposta (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL REFERENCES lead(id),
    itens_json TEXT NOT NULL DEFAULT '[]',
    subtotal_centimos INTEGER NOT NULL DEFAULT 0,
    desconto_pct REAL NOT NULL DEFAULT 0,
    desconto_centimos INTEGER NOT NULL DEFAULT 0,
    total_centimos INTEGER NOT NULL DEFAULT 0,
    contrapartida TEXT NOT NULL DEFAULT '',
    valor_hora_estimado REAL,
    estado TEXT NOT NULL DEFAULT 'rascunho',
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cliente_legal (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL REFERENCES lead(id),
    nome TEXT NOT NULL DEFAULT '',
    nif TEXT NOT NULL DEFAULT '',
    morada TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    telefone TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS contrato (
    id TEXT PRIMARY KEY,
    proposta_id TEXT NOT NULL REFERENCES proposta(id),
    template_versao TEXT NOT NULL DEFAULT 'v1',
    pdf_path TEXT NOT NULL DEFAULT '',
    hash_sha256 TEXT NOT NULL DEFAULT '',
    assinado_em TEXT,
    estado TEXT NOT NULL DEFAULT 'pendente',
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assinatura (
    id TEXT PRIMARY KEY,
    contrato_id TEXT NOT NULL REFERENCES contrato(id),
    png_path TEXT NOT NULL DEFAULT '',
    geo TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    dispositivo TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL,
    hash_documento TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS projeto (
    id TEXT PRIMARY KEY,
    contrato_id TEXT NOT NULL REFERENCES contrato(id),
    estado TEXT NOT NULL DEFAULT 'demonstracao_criada',
    estado_google TEXT NOT NULL DEFAULT 'por_criar',
    estado_dominio TEXT NOT NULL DEFAULT 'por_comprar',
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evento (
    id TEXT PRIMARY KEY,
    entidade TEXT NOT NULL,
    entidade_id TEXT NOT NULL,
    tipo TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nota (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL REFERENCES lead(id),
    texto TEXT NOT NULL DEFAULT '',
    criado_em TEXT NOT NULL
);

-- Self-serve onboarding app (/digitalize). No client accounts/OAuth yet
-- (credencial_oauth above is reserved for that, unused) — a session is
-- just a private resumable link, one per lead-in-progress.
CREATE TABLE IF NOT EXISTS digitalize_sessao (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL REFERENCES lead(id),
    nivel INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL,
    actualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_digitalize_sessao_lead ON digitalize_sessao(lead_id);

-- Append-only points ledger. UNIQUE(sessao_id, chave) makes awarding points
-- per step idempotent — replaying/re-answering a step never double-counts,
-- and the level (derived from the sum) can only ever go up.
CREATE TABLE IF NOT EXISTS digitalize_ponto (
    id TEXT PRIMARY KEY,
    sessao_id TEXT NOT NULL REFERENCES digitalize_sessao(id),
    chave TEXT NOT NULL,
    pontos INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL,
    UNIQUE (sessao_id, chave)
);

CREATE TABLE IF NOT EXISTS digitalize_pagamento (
    id TEXT PRIMARY KEY,
    sessao_id TEXT NOT NULL REFERENCES digitalize_sessao(id),
    lead_id TEXT NOT NULL REFERENCES lead(id),
    metodo TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'pendente',
    valor_centimos INTEGER NOT NULL DEFAULT 0,
    referencia_externa TEXT NOT NULL DEFAULT '',
    criado_em TEXT NOT NULL,
    pago_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_digitalize_pagamento_sessao ON digitalize_pagamento(sessao_id);
`;

// GBP-first commercial model. Prices in cents, s/ IVA.
// Admin may override rows marked admin_edited=1; seed only fills gaps / unedited rows.
const CATALOG_SEED = [
    { codigo: 'digitalize_app_basico', nome: 'Site + domínio (self-service)', descricao_cliente: 'Fluxo automático em digitalize.yourlabpt.com/digitalize: site publicado com domínio e hosting, sem intervenção de vendedor.', preco_centimos: 4900, tipo: 'pacote', ordem: 5 },
    { codigo: 'google_essencial', nome: 'Essencial Google', descricao_cliente: 'Configuração básica do Perfil Google Business / Maps (conta do cliente): criar ou reivindicar, dados, pin, horário, descrição, fotos essenciais e apoio à validação. Sem website.', preco_centimos: 29000, tipo: 'pacote', ordem: 10 },
    { codigo: 'site_maps', nome: 'Site + Maps', descricao_cliente: 'Landing page + ligar ou atualizar o perfil Google já existente (website, contactos, fotos chave). Ideal quando o Maps já existe.', preco_centimos: 39000, tipo: 'pacote', ordem: 15 },
    { codigo: 'digital_completo', nome: 'Completo 0→100', descricao_cliente: 'Perfil Google completo (conta, reivindicar, dados, visuais, validação, perfil 100%) mais landing alinhada ao perfil. Sem promessa de ranking.', preco_centimos: 59000, tipo: 'pacote', ordem: 18 },
    { codigo: 'plus', nome: 'Presença Digital Plus', descricao_cliente: 'Website multipágina, catálogo, até 2 idiomas, mais arranque Google (criar/atualizar perfil). Domínio/alojamento ou ZIP.', preco_centimos: 99000, tipo: 'pacote', ordem: 20 },
    { codigo: 'renovacao', nome: 'Renovação de Website', descricao_cliente: 'Substitui um site antigo, lento ou não responsivo. Inclui migração básica e atualização do Perfil Google / Maps.', preco_centimos: 79000, tipo: 'pacote', ordem: 30 },
    { codigo: 'google_perfil_completo', nome: 'Completar perfil Google 100%', descricao_cliente: 'Upgrade a partir do Essencial: serviços, produtos, atributos, links, WhatsApp, redes e revisão completa do perfil.', preco_centimos: 8000, tipo: 'extra', ordem: 33 },
    { codigo: 'google_avaliacoes', nome: 'Orientação de avaliações Google', descricao_cliente: 'Sessão para pedir avaliações reais aos clientes e responder de forma profissional. Sem compra de reviews.', preco_centimos: 2500, tipo: 'extra', ordem: 34 },
    { codigo: 'assistencia_uso', nome: 'Assistência e formação de utilização', descricao_cliente: 'Sessão em português para ensinar a usar o website e as contas criadas. Pensado para quem não tem hábito digital.', preco_centimos: 6000, tipo: 'extra', ordem: 35 },
    { codigo: 'ajuda_dominio_cliente', nome: 'Ajuda a comprar e apontar o domínio', descricao_cliente: 'Acompanhamento passo a passo para o cliente comprar o domínio e ligá-lo ao site (ou ao ZIP).', preco_centimos: 4000, tipo: 'extra', ordem: 36 },
    { codigo: 'conta_email_gmail', nome: 'Criação de email Gmail do negócio', descricao_cliente: 'Criação e organização básica de um Gmail profissional para o estabelecimento.', preco_centimos: 3500, tipo: 'extra', ordem: 37 },
    { codigo: 'whatsapp_negocio', nome: 'WhatsApp no site + orientação Business', descricao_cliente: 'Botão de contacto no site e orientação para configurar o WhatsApp Business.', preco_centimos: 3000, tipo: 'extra', ordem: 38 },
    { codigo: 'ligacao_redes', nome: 'Ligação do site às redes sociais', descricao_cliente: 'Ligações para Instagram e Facebook, e texto simples para a bio.', preco_centimos: 2500, tipo: 'extra', ordem: 39 },
    { codigo: 'conteudo_visual', nome: 'Conteúdo visual básico', descricao_cliente: 'Fotos simples captadas no local para o site e/ou Perfil Google. Não é sessão fotográfica profissional.', preco_centimos: 4000, tipo: 'extra', ordem: 41 },
    { codigo: 'pagina_adicional', nome: 'Página adicional', descricao_cliente: '', preco_centimos: 9000, tipo: 'extra', ordem: 40 },
    { codigo: 'idioma_adicional', nome: 'Idioma adicional', descricao_cliente: 'Tradução automática revista.', preco_centimos: 19000, tipo: 'extra', ordem: 50 },
    { codigo: 'catalogo_menu', nome: 'Catálogo / menu (+20 itens)', descricao_cliente: '', preco_centimos: 12000, tipo: 'extra', ordem: 60 },
    { codigo: 'tratamento_imagens', nome: 'Tratamento de imagens do cliente (+15 ficheiros)', descricao_cliente: '', preco_centimos: 6000, tipo: 'extra', ordem: 70 },
    { codigo: 'email_profissional', nome: 'Email profissional', descricao_cliente: 'Configuração no domínio do cliente (ex.: info@negocio.pt).', preco_centimos: 9000, tipo: 'extra', ordem: 80 },
    { codigo: 'qr_cartao', nome: 'QR Code + cartão', descricao_cliente: 'PDF pronto a imprimir para a montra e o balcão.', preco_centimos: 4000, tipo: 'extra', ordem: 90 },
    { codigo: 'video_guia', nome: 'Vídeo-guia de utilização', descricao_cliente: 'Vídeo curto em português a explicar como alterar o essencial e onde clicar.', preco_centimos: 4500, tipo: 'extra', ordem: 95 },
    { codigo: 'visita_setup', nome: 'Sessão presencial de arranque', descricao_cliente: 'No estabelecimento: marcar o site no telemóvel, favoritos, QR e, se contratado, o Perfil Google.', preco_centimos: 8000, tipo: 'extra', ordem: 96 },
    { codigo: 'marcacoes', nome: 'Sistema de marcações / formulário avançado', descricao_cliente: '', preco_centimos: 25000, tipo: 'extra', ordem: 100 },
    { codigo: 'pagamentos', nome: 'Integração de pagamentos', descricao_cliente: '', preco_centimos: 35000, tipo: 'extra', ordem: 110 },
    { codigo: 'migracao', nome: 'Migração e redirecionamentos', descricao_cliente: '', preco_centimos: 15000, tipo: 'extra', ordem: 120 },
    { codigo: 'ronda_extra', nome: 'Ronda de revisão extra', descricao_cliente: '', preco_centimos: 6000, tipo: 'extra', ordem: 130 },
    { codigo: 'alteracao_pos_aprovacao', nome: 'Alteração após aprovação final (até 30 min)', descricao_cliente: '', preco_centimos: 4500, tipo: 'extra', ordem: 140 },
    { codigo: 'urgencia', nome: 'Urgência (entrega em 48h)', descricao_cliente: '', preco_centimos: 0, percentual: 0.30, tipo: 'ajuste', ordem: 150 },
    { codigo: 'manutencao_maps', nome: 'Manutenção Google Maps', descricao_cliente: 'Manter o Perfil Google activo: horários, fotos, publicações leves e respostas a avaliações quando o cliente pede.', preco_centimos: 1000, tipo: 'manutencao', ordem: 160 },
    { codigo: 'hosting_landing', nome: 'Hosting landing (YourLab)', descricao_cliente: 'Alojamento da landing page nos servidores YourLab.', preco_centimos: 500, tipo: 'manutencao', ordem: 170 },
    { codigo: 'hosting_site', nome: 'Hosting site (YourLab)', descricao_cliente: 'Alojamento de website multipágina nos servidores YourLab.', preco_centimos: 1000, tipo: 'manutencao', ordem: 180 },
    { codigo: 'essencial', nome: 'Landing Presença Digital (legado)', descricao_cliente: 'Substituído pelo Site + Maps / Completo.', preco_centimos: 29000, tipo: 'pacote', ordem: 900, ativo: 0 },
    { codigo: 'completa', nome: 'Digitalização Completa (legado)', descricao_cliente: 'Substituído pelo Completo 0→100.', preco_centimos: 39000, tipo: 'pacote', ordem: 901, ativo: 0 },
    { codigo: 'presenca_google', nome: 'Presença no Google (legado)', descricao_cliente: 'Incluído nos pacotes Google.', preco_centimos: 10000, tipo: 'extra', ordem: 902, ativo: 0 },
    { codigo: 'manutencao_base', nome: 'Manutenção Base (legado)', descricao_cliente: 'Substituída por hosting + Maps.', preco_centimos: 2900, tipo: 'manutencao', ordem: 910, ativo: 0 },
    { codigo: 'manutencao_cuidado', nome: 'Manutenção Cuidado (legado)', descricao_cliente: 'Substituída por hosting + Maps.', preco_centimos: 5900, tipo: 'manutencao', ordem: 911, ativo: 0 },
    { codigo: 'manutencao_evolucao', nome: 'Manutenção Evolução (legado)', descricao_cliente: 'Substituída por hosting + Maps.', preco_centimos: 12900, tipo: 'manutencao', ordem: 912, ativo: 0 }
];

function nowIso() {
    return new Date().toISOString();
}

// CREATE TABLE IF NOT EXISTS never alters an existing table, so new columns have
// to be added explicitly or an already-created DB silently keeps the old shape.
function addMissingColumns(db, table, columns) {
    const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    Object.entries(columns).forEach(([name, definition]) => {
        if (!existing.has(name)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
        }
    });
}

function migrate(db) {
    addMissingColumns(db, 'proposta', {
        iva_rate: 'REAL NOT NULL DEFAULT 0',
        iva_centimos: 'INTEGER NOT NULL DEFAULT 0',
        total_com_iva_centimos: 'INTEGER NOT NULL DEFAULT 0'
    });
    addMissingColumns(db, 'lead', {
        demo_json: "TEXT NOT NULL DEFAULT '{}'",
        identidade_json: "TEXT NOT NULL DEFAULT '{}'",
        demo_slug: "TEXT NOT NULL DEFAULT ''",
        work_path: "TEXT NOT NULL DEFAULT ''",
        notas_admin: "TEXT NOT NULL DEFAULT ''",
        google_presence_json: "TEXT NOT NULL DEFAULT '{}'",
        wizard_json: "TEXT NOT NULL DEFAULT '{}'",
        cidade: "TEXT NOT NULL DEFAULT ''",
        cobertura: "TEXT NOT NULL DEFAULT 'contacto_remoto'",
        cobertura_locked: 'INTEGER NOT NULL DEFAULT 0',
        resultado: "TEXT NOT NULL DEFAULT ''",
        lat: 'REAL',
        lng: 'REAL',
        geocoded_at: "TEXT NOT NULL DEFAULT ''",
        geocode_status: "TEXT NOT NULL DEFAULT ''",
        demo_html: "TEXT NOT NULL DEFAULT ''",
        followup_json: "TEXT NOT NULL DEFAULT '{}'",
        processo_estado: "TEXT NOT NULL DEFAULT ''",
        proxima_acao_em: "TEXT NOT NULL DEFAULT ''",
        revisitar_em: "TEXT NOT NULL DEFAULT ''",
        processo_json: "TEXT NOT NULL DEFAULT '{}'",
        atualizado_em: "TEXT NOT NULL DEFAULT ''"
    });
    // First insert stays on criado_em forever; atualizado_em tracks later edits.
    db.prepare(`
        UPDATE lead SET atualizado_em = criado_em
        WHERE atualizado_em = '' OR atualizado_em IS NULL
    `).run();
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS lead_stamp_atualizado
        AFTER UPDATE ON lead
        FOR EACH ROW
        WHEN NEW.atualizado_em IS OLD.atualizado_em
        BEGIN
            UPDATE lead SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;
    `);
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS lead_stamp_atualizado_insert
        AFTER INSERT ON lead
        FOR EACH ROW
        WHEN NEW.atualizado_em IS NULL OR NEW.atualizado_em = ''
        BEGIN
            UPDATE lead SET atualizado_em = COALESCE(NULLIF(NEW.criado_em, ''), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            WHERE id = NEW.id;
        END;
    `);
    addMissingColumns(db, 'contrato', {
        html_path: "TEXT NOT NULL DEFAULT ''"
    });
    addMissingColumns(db, 'servico', {
        admin_edited: 'INTEGER NOT NULL DEFAULT 0'
    });
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_demo_slug
        ON lead(demo_slug) WHERE demo_slug != ''`);
    db.exec(`CREATE TABLE IF NOT EXISTS nota (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL REFERENCES lead(id),
        texto TEXT NOT NULL DEFAULT '',
        criado_em TEXT NOT NULL
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS visita (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL DEFAULT '',
        morada TEXT NOT NULL DEFAULT '',
        cidade TEXT NOT NULL DEFAULT '',
        cobertura TEXT NOT NULL DEFAULT 'visitado',
        experiencia TEXT NOT NULL DEFAULT '',
        lat REAL,
        lng REAL,
        geocode_status TEXT NOT NULL DEFAULT '',
        visitado_em TEXT NOT NULL DEFAULT '',
        criado_em TEXT NOT NULL,
        lead_id TEXT,
        resultado TEXT NOT NULL DEFAULT ''
    )`);
    addMissingColumns(db, 'visita', {
        lead_id: 'TEXT',
        resultado: "TEXT NOT NULL DEFAULT ''"
    });
    db.exec(`CREATE INDEX IF NOT EXISTS idx_visita_lead ON visita(lead_id)`);

    // The guided process timeline. `texto` keeps what was actually sent, so a lead
    // can be resumed months later without repeating a single message.
    db.exec(`CREATE TABLE IF NOT EXISTS lead_toque (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL REFERENCES lead(id),
        ordem INTEGER NOT NULL DEFAULT 0,
        passo TEXT NOT NULL DEFAULT '',
        canal TEXT NOT NULL DEFAULT '',
        estado TEXT NOT NULL DEFAULT 'agendado',
        agendado_para TEXT NOT NULL DEFAULT '',
        executado_em TEXT NOT NULL DEFAULT '',
        resultado TEXT NOT NULL DEFAULT '',
        destino TEXT NOT NULL DEFAULT '',
        objecao TEXT NOT NULL DEFAULT '',
        nota TEXT NOT NULL DEFAULT '',
        texto TEXT NOT NULL DEFAULT '',
        lang TEXT NOT NULL DEFAULT 'pt',
        vendedor TEXT NOT NULL DEFAULT '',
        criado_em TEXT NOT NULL
    )`);
    addMissingColumns(db, 'lead_toque', {
        destino: "TEXT NOT NULL DEFAULT ''",
        vendedor: "TEXT NOT NULL DEFAULT ''"
    });
    db.exec(`CREATE INDEX IF NOT EXISTS idx_lead_toque_lead ON lead_toque(lead_id, criado_em)`);

    // Demo page hits are the only clean signal source — the cold email carries no tracking.
    db.exec(`CREATE TABLE IF NOT EXISTS demo_visita (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL REFERENCES lead(id),
        slug TEXT NOT NULL DEFAULT '',
        referer TEXT NOT NULL DEFAULT '',
        fonte TEXT NOT NULL DEFAULT '',
        criado_em TEXT NOT NULL
    )`);
    addMissingColumns(db, 'demo_visita', {
        fonte: "TEXT NOT NULL DEFAULT ''"
    });
    db.exec(`CREATE INDEX IF NOT EXISTS idx_demo_visita_lead ON demo_visita(lead_id, criado_em)`);

    db.exec(`CREATE TABLE IF NOT EXISTS app_setting (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        actualizado_em TEXT NOT NULL
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS presenca_mapa (
        id TEXT PRIMARY KEY,
        projeto_id TEXT NOT NULL REFERENCES projeto(id),
        fornecedor TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'nao_iniciado',
        referencia_externa TEXT NOT NULL DEFAULT '',
        submetido_em TEXT NOT NULL DEFAULT '',
        verificado_em TEXT NOT NULL DEFAULT '',
        ultimo_erro TEXT NOT NULL DEFAULT '',
        tentativas INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL DEFAULT '{}',
        criado_em TEXT NOT NULL,
        actualizado_em TEXT NOT NULL,
        UNIQUE (projeto_id, fornecedor)
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_presenca_projeto ON presenca_mapa(projeto_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_presenca_estado ON presenca_mapa(estado)`);

    // Schema reserved for Phase 3 Google OAuth — unused in v1.
    db.exec(`CREATE TABLE IF NOT EXISTS credencial_oauth (
        id TEXT PRIMARY KEY,
        cliente_id TEXT NOT NULL,
        fornecedor TEXT NOT NULL,
        refresh_token_cifrado TEXT NOT NULL DEFAULT '',
        scopes TEXT NOT NULL DEFAULT '',
        revogado_em TEXT NOT NULL DEFAULT '',
        criado_em TEXT NOT NULL
    )`);

    try {
        const {
            backfillLeadGeoFields,
            remapCoberturaToEtapaResultado
        } = require('./digitalizept-geocode');
        remapCoberturaToEtapaResultado(db);
        backfillLeadGeoFields(db);
    } catch (err) {
        console.error('digitalizept: cobertura backfill failed:', err.message);
    }
}

// Seed inserts new codes and refreshes rows the admin has not locked.
// `admin_edited=1` rows keep local prices/copy/ativo.
function seedCatalog(db) {
    const insert = db.prepare(`
        INSERT INTO servico (id, codigo, nome, descricao_cliente, preco_centimos, percentual, tipo, ativo, ordem, admin_edited)
        VALUES (@id, @codigo, @nome, @descricao_cliente, @preco_centimos, @percentual, @tipo, @ativo, @ordem, 0)
    `);
    const update = db.prepare(`
        UPDATE servico SET nome = @nome, descricao_cliente = @descricao_cliente,
            preco_centimos = @preco_centimos, percentual = @percentual,
            tipo = @tipo, ordem = @ordem, ativo = @ativo
        WHERE codigo = @codigo AND admin_edited = 0
    `);
    const findByCode = db.prepare('SELECT id, admin_edited FROM servico WHERE codigo = ?');

    const sync = db.transaction((items) => {
        items.forEach((item) => {
            const row = {
                id: crypto.randomUUID(),
                percentual: null,
                ...item,
                ativo: item.ativo === 0 ? 0 : 1
            };
            const existing = findByCode.get(item.codigo);
            if (existing) {
                if (!existing.admin_edited) update.run(row);
            } else {
                insert.run(row);
            }
        });
    });

    sync(CATALOG_SEED);
}

let dbInstance = null;

function getDb() {
    if (dbInstance) return dbInstance;

    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.exec(SCHEMA);
    migrate(dbInstance);
    seedCatalog(dbInstance);

    return dbInstance;
}

function logEvento(db, entidade, entidadeId, tipo, payload = {}) {
    db.prepare(`
        INSERT INTO evento (id, entidade, entidade_id, tipo, payload_json, criado_em)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), entidade, entidadeId, tipo, JSON.stringify(payload), nowIso());
}

module.exports = {
    DB_PATH,
    SCHEMA,
    migrate,
    getDb,
    nowIso,
    logEvento
};
