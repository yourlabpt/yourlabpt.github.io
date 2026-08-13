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
    ordem INTEGER NOT NULL DEFAULT 0
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
`;

// From 01 · Modelo Comercial e Preços (2026-08-10). Prices in cents, s/ IVA.
// Deliverables of each package are expanded in the contract (see PACKAGE_DELIVERABLES).
const CATALOG_SEED = [
    { codigo: 'essencial', nome: 'Presença Digital Essencial', descricao_cliente: 'Landing page, ficha Google Maps, conta Google, domínio/alojamento ou entrega em ZIP. Ideal para quem ainda não tem presença online.', preco_centimos: 49000, tipo: 'pacote', ordem: 10 },
    { codigo: 'plus', nome: 'Presença Digital Plus', descricao_cliente: 'Várias páginas, catálogo, até 2 idiomas. Inclui o mesmo arranque Google e domínio do Essencial.', preco_centimos: 99000, tipo: 'pacote', ordem: 20 },
    { codigo: 'renovacao', nome: 'Renovação de Website', descricao_cliente: 'Substitui um site antigo, lento ou não responsivo. Inclui migração básica e o arranque Google.', preco_centimos: 79000, tipo: 'pacote', ordem: 30 },
    { codigo: 'assistencia_uso', nome: 'Assistência e formação de utilização', descricao_cliente: 'Sessão em português para ensinar a usar o website, a ficha Google e as contas criadas. Pensado para quem não tem hábito digital.', preco_centimos: 6000, tipo: 'extra', ordem: 35 },
    { codigo: 'ajuda_dominio_cliente', nome: 'Ajuda a comprar e apontar o domínio', descricao_cliente: 'Acompanhamento passo a passo para o cliente comprar o domínio e ligá-lo ao site (ou ao ZIP).', preco_centimos: 4000, tipo: 'extra', ordem: 36 },
    { codigo: 'conta_email_gmail', nome: 'Criação de email Gmail do negócio', descricao_cliente: 'Criação e organização básica de um Gmail profissional para o estabelecimento.', preco_centimos: 3500, tipo: 'extra', ordem: 37 },
    { codigo: 'whatsapp_negocio', nome: 'WhatsApp no site + orientação Business', descricao_cliente: 'Botão de contacto no site e orientação para configurar o WhatsApp Business.', preco_centimos: 3000, tipo: 'extra', ordem: 38 },
    { codigo: 'ligacao_redes', nome: 'Ligação do site às redes sociais', descricao_cliente: 'Ligações para Instagram e Facebook, e texto simples para a bio.', preco_centimos: 2500, tipo: 'extra', ordem: 39 },
    { codigo: 'pagina_adicional', nome: 'Página adicional', descricao_cliente: '', preco_centimos: 9000, tipo: 'extra', ordem: 40 },
    { codigo: 'idioma_adicional', nome: 'Idioma adicional', descricao_cliente: 'Tradução automática revista.', preco_centimos: 19000, tipo: 'extra', ordem: 50 },
    { codigo: 'catalogo_menu', nome: 'Catálogo / menu (+20 itens)', descricao_cliente: '', preco_centimos: 12000, tipo: 'extra', ordem: 60 },
    { codigo: 'tratamento_imagens', nome: 'Tratamento de imagens do cliente (+15 ficheiros)', descricao_cliente: '', preco_centimos: 6000, tipo: 'extra', ordem: 70 },
    { codigo: 'email_profissional', nome: 'Email profissional', descricao_cliente: 'Configuração no domínio do cliente (ex.: info@negocio.pt).', preco_centimos: 9000, tipo: 'extra', ordem: 80 },
    { codigo: 'qr_cartao', nome: 'QR Code + cartão', descricao_cliente: 'PDF pronto a imprimir para a montra e o balcão.', preco_centimos: 4000, tipo: 'extra', ordem: 90 },
    { codigo: 'video_guia', nome: 'Vídeo-guia de utilização', descricao_cliente: 'Vídeo curto em português a explicar como alterar o essencial e onde clicar.', preco_centimos: 4500, tipo: 'extra', ordem: 95 },
    { codigo: 'visita_setup', nome: 'Sessão presencial de arranque', descricao_cliente: 'No estabelecimento: marcar o site no telemóvel, favoritos, QR e ficha Google.', preco_centimos: 8000, tipo: 'extra', ordem: 96 },
    { codigo: 'marcacoes', nome: 'Sistema de marcações / formulário avançado', descricao_cliente: '', preco_centimos: 25000, tipo: 'extra', ordem: 100 },
    { codigo: 'pagamentos', nome: 'Integração de pagamentos', descricao_cliente: '', preco_centimos: 35000, tipo: 'extra', ordem: 110 },
    { codigo: 'migracao', nome: 'Migração e redirecionamentos', descricao_cliente: '', preco_centimos: 15000, tipo: 'extra', ordem: 120 },
    { codigo: 'ronda_extra', nome: 'Ronda de revisão extra', descricao_cliente: '', preco_centimos: 6000, tipo: 'extra', ordem: 130 },
    { codigo: 'alteracao_pos_aprovacao', nome: 'Alteração após aprovação final (até 30 min)', descricao_cliente: '', preco_centimos: 4500, tipo: 'extra', ordem: 140 },
    { codigo: 'urgencia', nome: 'Urgência (entrega em 48h)', descricao_cliente: '', preco_centimos: 0, percentual: 0.30, tipo: 'ajuste', ordem: 150 },
    { codigo: 'manutencao_base', nome: 'Manutenção Base', descricao_cliente: 'Alojamento, domínio, SSL, backups, monitorização, atualizações de segurança.', preco_centimos: 2900, tipo: 'manutencao', ordem: 160 },
    { codigo: 'manutencao_cuidado', nome: 'Manutenção Cuidado', descricao_cliente: 'Base + 1h/mês de alterações de conteúdo + atualização da ficha Google.', preco_centimos: 5900, tipo: 'manutencao', ordem: 170 },
    { codigo: 'manutencao_evolucao', nome: 'Manutenção Evolução', descricao_cliente: 'Cuidado + 3h/mês para novas secções + prioridade de resposta 24h.', preco_centimos: 12900, tipo: 'manutencao', ordem: 180 }
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
        work_path: "TEXT NOT NULL DEFAULT ''"
    });
    addMissingColumns(db, 'contrato', {
        html_path: "TEXT NOT NULL DEFAULT ''"
    });
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_demo_slug
        ON lead(demo_slug) WHERE demo_slug != ''`);
}

// The seed is the source of truth for pricing, so it is re-applied on every boot
// rather than only into an empty table — otherwise a price change here would
// never reach a machine that already has a DB. `ativo` is left alone because
// that is a local toggle, not a price.
function seedCatalog(db) {
    const insert = db.prepare(`
        INSERT INTO servico (id, codigo, nome, descricao_cliente, preco_centimos, percentual, tipo, ativo, ordem)
        VALUES (@id, @codigo, @nome, @descricao_cliente, @preco_centimos, @percentual, @tipo, 1, @ordem)
    `);
    const update = db.prepare(`
        UPDATE servico SET nome = @nome, descricao_cliente = @descricao_cliente,
            preco_centimos = @preco_centimos, percentual = @percentual,
            tipo = @tipo, ordem = @ordem
        WHERE codigo = @codigo
    `);
    const findByCode = db.prepare('SELECT id FROM servico WHERE codigo = ?');

    const sync = db.transaction((items) => {
        items.forEach((item) => {
            const row = { id: crypto.randomUUID(), percentual: null, ...item };
            if (findByCode.get(item.codigo)) {
                update.run(row);
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
    getDb,
    nowIso,
    logEvento
};
