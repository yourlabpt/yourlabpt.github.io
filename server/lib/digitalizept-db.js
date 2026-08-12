/**
 * SQLite store for the Digitalize Portugal sales app.
 * One file, one vendedor (owner) for now — see 06 · Plano de Execução da Plataforma on Notion.
 */
const crypto = require('crypto');
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
const CATALOG_SEED = [
    { codigo: 'essencial', nome: 'Presença Digital Essencial', descricao_cliente: 'Página única profissional, mobile-first, com ficha Google, domínio, alojamento e conformidade legal incluídos.', preco_centimos: 49000, tipo: 'pacote', ordem: 10 },
    { codigo: 'plus', nome: 'Presença Digital Plus', descricao_cliente: 'Várias páginas, catálogo, até 2 idiomas. Substitui o Essencial.', preco_centimos: 99000, tipo: 'pacote', ordem: 20 },
    { codigo: 'renovacao', nome: 'Renovação de Website', descricao_cliente: 'Substitui um site antigo, lento ou não responsivo. Substitui o Essencial.', preco_centimos: 79000, tipo: 'pacote', ordem: 30 },
    { codigo: 'pagina_adicional', nome: 'Página adicional', descricao_cliente: '', preco_centimos: 9000, tipo: 'extra', ordem: 40 },
    { codigo: 'idioma_adicional', nome: 'Idioma adicional', descricao_cliente: 'Tradução automática revista.', preco_centimos: 19000, tipo: 'extra', ordem: 50 },
    { codigo: 'catalogo_menu', nome: 'Catálogo / menu (+20 itens)', descricao_cliente: '', preco_centimos: 12000, tipo: 'extra', ordem: 60 },
    { codigo: 'tratamento_imagens', nome: 'Tratamento de imagens do cliente (+15 ficheiros)', descricao_cliente: '', preco_centimos: 6000, tipo: 'extra', ordem: 70 },
    { codigo: 'email_profissional', nome: 'Email profissional', descricao_cliente: 'Configuração no domínio do cliente.', preco_centimos: 9000, tipo: 'extra', ordem: 80 },
    { codigo: 'qr_cartao', nome: 'QR Code + cartão', descricao_cliente: 'PDF pronto a imprimir.', preco_centimos: 4000, tipo: 'extra', ordem: 90 },
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

function seedCatalog(db) {
    const count = db.prepare('SELECT COUNT(*) AS n FROM servico').get().n;
    if (count > 0) return;

    const insert = db.prepare(`
        INSERT INTO servico (id, codigo, nome, descricao_cliente, preco_centimos, percentual, tipo, ativo, ordem)
        VALUES (@id, @codigo, @nome, @descricao_cliente, @preco_centimos, @percentual, @tipo, 1, @ordem)
    `);

    const insertAll = db.transaction((items) => {
        items.forEach((item) => {
            insert.run({
                id: crypto.randomUUID(),
                percentual: null,
                ...item
            });
        });
    });

    insertAll(CATALOG_SEED);
}

let dbInstance = null;

function getDb() {
    if (dbInstance) return dbInstance;

    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.exec(SCHEMA);
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
