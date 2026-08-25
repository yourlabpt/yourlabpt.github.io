const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { SCHEMA, migrate } = require('../../server/lib/digitalizept-db.js');
const proc = require('../../server/lib/digitalizept-lead-process.js');

const CHROME_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';

function openMemoryDb() {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    migrate(db);
    return db;
}

function seedLead(db, { email = 'dono@example.com', telefone = '912345678', demo = 'talho-x', tipo = 'generico' } = {}) {
    const now = new Date().toISOString();
    const leadId = crypto.randomUUID();
    db.prepare(`
        INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, criado_em, demo_slug)
        VALUES (?, ?, 'Talho X', 'Rua A 1', 'Porto', ?, ?, 'novo', ?, ?)
    `).run(leadId, tipo, telefone, telefone, now, demo);
    db.prepare(`
        INSERT INTO dados_negocio (id, lead_id, obrigatorios_json, opcionais_json, criado_em)
        VALUES (?, ?, ?, '{}', ?)
    `).run(
        crypto.randomUUID(),
        leadId,
        JSON.stringify({ nome_negocio: 'Talho X', responsavel: 'Costa', telefone, email, cidade: 'Porto' }),
        now
    );
    return leadId;
}

describe('digitalizept lead process — schema', () => {
    it('adds the process columns and the two new tables', () => {
        const db = openMemoryDb();
        const cols = db.prepare('PRAGMA table_info(lead)').all().map((c) => c.name);
        ['processo_estado', 'proxima_acao_em', 'revisitar_em', 'processo_json'].forEach((c) => {
            assert.ok(cols.includes(c), `falta ${c}`);
        });
        const toque = db.prepare('PRAGMA table_info(lead_toque)').all().map((c) => c.name);
        ['ordem', 'passo', 'canal', 'estado', 'destino', 'texto', 'lang', 'vendedor'].forEach((c) => {
            assert.ok(toque.includes(c), `falta lead_toque.${c}`);
        });
        const visita = db.prepare('PRAGMA table_info(demo_visita)').all().map((c) => c.name);
        assert.ok(visita.includes('slug'));
        db.close();
    });
});

describe('digitalizept lead process — estados', () => {
    it('derives the state from what is already stored', () => {
        const semDemo = proc.computeEstado({ row: {}, contacto: { email: 'a@b.pt' } });
        assert.equal(semDemo, 'NOVO');

        const comCanal = proc.computeEstado({
            row: { demo_slug: 'x' },
            contacto: { email: 'a@b.pt' }
        });
        assert.equal(comCanal, 'DEMO_PRONTO');

        // Only the shop's landline: the discovery cycle comes first.
        const semCanal = proc.computeEstado({ row: { demo_slug: 'x' }, contacto: { tipoNumero: '2x' } });
        assert.equal(semCanal, 'DESCOBERTA');

        const emSequencia = proc.computeEstado({
            row: { demo_slug: 'x' },
            contacto: { email: 'a@b.pt' },
            toques: [{ passo: 'EMAIL1', estado: 'feito' }]
        });
        assert.equal(emSequencia, 'EM_SEQUENCIA');

        const respondeu = proc.computeEstado({
            row: { demo_slug: 'x' },
            contacto: { email: 'a@b.pt' },
            followup: { replied1At: 'agora' }
        });
        assert.equal(respondeu, 'RESPONDEU');
    });

    it('accepts REMOVIDO from every state', () => {
        proc.PROCESSO_ESTADOS.forEach((estado) => {
            const saida = proc.computeEstado({
                row: { demo_slug: 'x', processo_estado: estado },
                followup: { unsubscribed: true },
                contacto: { email: 'a@b.pt' }
            });
            assert.equal(saida, 'REMOVIDO', `${estado} devia poder ir para REMOVIDO`);
        });
    });

    it('keeps the manual states and never derives back out of them', () => {
        ['PROPOSTA', 'VISITA', 'RECUSADO', 'ADORMECIDO', 'REVISITA', 'ARQUIVADO'].forEach((estado) => {
            const saida = proc.computeEstado({
                row: { demo_slug: 'x', processo_estado: estado },
                contacto: { email: 'a@b.pt' },
                toques: [{ passo: 'EMAIL1', estado: 'feito' }]
            });
            assert.equal(saida, estado);
        });
    });
});

describe('digitalizept lead process — motor de tempo', () => {
    it('lets the global exclusions win over any category window', () => {
        // Friday 15:00 Lisbon is inside a retail window and still excluded.
        const sexta = new Date('2026-08-21T14:00:00.000Z');
        assert.equal(proc.slotIsAllowed(sexta, { horas: [[15 * 60, 18 * 60]] }), false);
        // Monday is out even at a perfectly good hour.
        assert.equal(proc.slotIsAllowed(new Date('2026-09-07T09:00:00.000Z')), false);
        // Lunch is out.
        assert.equal(proc.slotIsAllowed(new Date('2026-09-09T12:30:00.000Z')), false);
        // August is out entirely.
        assert.equal(proc.slotIsAllowed(new Date('2026-08-12T09:00:00.000Z')), false);
        // Wednesday at 10:00 in September is fine.
        assert.equal(proc.slotIsAllowed(new Date('2026-09-09T09:00:00.000Z')), true);
    });

    it('anchors the emails at 09:30 and never lands on an excluded slot', () => {
        const iso = proc.proximaAcaoEm('2026-09-09T06:00:00.000Z', 0, { ancora: { hour: 9, minute: 30 } });
        const parts = proc.lisbonParts(new Date(iso));
        assert.equal(parts.hour, 9);
        assert.equal(parts.minute, 30);
        assert.ok(proc.slotIsAllowed(new Date(iso)));

        const fromMonday = proc.proximaAcaoEm('2026-09-07T06:00:00.000Z', 0, { ancora: { hour: 9, minute: 30 } });
        assert.notEqual(proc.lisbonParts(new Date(fromMonday)).weekday, 1);
    });

    it('spaces WhatsApp 1 four to six hours after the email, stably per lead', () => {
        const a = proc.ponteHoras('lead-a');
        const b = proc.ponteHoras('lead-b');
        assert.ok(a >= proc.PONTE_HORAS_MIN && a <= proc.PONTE_HORAS_MAX);
        assert.ok(b >= proc.PONTE_HORAS_MIN && b <= proc.PONTE_HORAS_MAX);
        assert.equal(proc.ponteHoras('lead-a'), a);
        assert.notEqual(a % 1 === 0 && b % 1 === 0 && a === b, true);
    });
});

describe('digitalizept lead process — sinal', () => {
    it('turns on from each of the three sources on its own', () => {
        assert.deepEqual(
            proc.computeSinal({ followup: { replied1At: 'x' } }),
            { sinal: true, origem: 'respondeu' }
        );
        assert.deepEqual(
            proc.computeSinal({ toques: [{ canal: 'ligacao', resultado: 'viu' }] }),
            { sinal: true, origem: 'chamada_atendida' }
        );
        assert.deepEqual(
            proc.computeSinal({ visitasDemo: 1 }),
            { sinal: true, origem: 'visitou_demo' }
        );
        assert.equal(proc.computeSinal({}).sinal, false);
        // A call that was never answered is not a signal.
        assert.equal(
            proc.computeSinal({ toques: [{ canal: 'ligacao', resultado: 'nao_atendeu' }] }).sinal,
            false
        );
        // A receptionist on Ciclo D is not engagement with the demo sequence.
        assert.equal(
            proc.computeSinal({
                toques: [{ passo: 'D1', canal: 'ligacao', resultado: 'funcionario' }]
            }).sinal,
            false
        );
        assert.equal(
            proc.computeSinal({
                toques: [{ passo: 'LIG1', canal: 'ligacao', resultado: 'funcionario' }]
            }).sinal,
            true
        );
    });

    it('does not count a WhatsApp link preview as a demo visit', () => {
        const db = openMemoryDb();
        const leadId = seedLead(db);
        assert.equal(proc.registarVisitaDemo(db, { leadId, userAgent: 'WhatsApp/2.23' }), false);
        assert.equal(proc.registarVisitaDemo(db, { leadId, userAgent: 'facebookexternalhit/1.1' }), false);
        assert.equal(proc.registarVisitaDemo(db, { leadId, userAgent: '' }), false);
        assert.equal(proc.countDemoVisitas(db, leadId), 0);

        assert.equal(proc.registarVisitaDemo(db, { leadId, userAgent: CHROME_UA }), true);
        // Deduplicated by the hour: a refresh is not a second signal.
        assert.equal(proc.registarVisitaDemo(db, { leadId, userAgent: CHROME_UA }), false);
        assert.equal(proc.countDemoVisitas(db, leadId), 1);

        const outro = seedLead(db, { demo: 'talho-y', email: 'y@example.com' });
        assert.equal(proc.registarVisitaDemo(db, {
            leadId: outro,
            userAgent: CHROME_UA,
            referer: 'https://yourlabpt.com/digitalizept/admin.html'
        }), false);
        assert.equal(proc.countDemoVisitas(db, outro), 0);
        db.close();
    });
});

describe('digitalizept lead process — cadência', () => {
    it('walks the six touches and skips Email 1 when there is no email', () => {
        const primeiro = proc.nextTouch({ estado: 'DEMO_PRONTO', contacto: { email: 'a@b.pt' } });
        assert.equal(primeiro.passo, 'EMAIL1');
        assert.equal(primeiro.saltar, false);

        const semEmail = proc.nextTouch({ estado: 'DEMO_PRONTO', contacto: {} });
        assert.equal(semEmail.passo, 'EMAIL1');
        assert.equal(semEmail.saltar, true);
        assert.equal(semEmail.motivo, 'sem_email');

        const depoisDoEmail = proc.nextTouch({
            estado: 'EM_SEQUENCIA',
            contacto: { email: 'a@b.pt' },
            toques: [{ passo: 'EMAIL1', estado: 'feito', executado_em: '2026-09-09T08:30:00.000Z' }],
            leadId: 'lead-a'
        });
        assert.equal(depoisDoEmail.passo, 'WA1');
        assert.ok(depoisDoEmail.intervaloHoras >= proc.PONTE_HORAS_MIN);
        assert.ok(depoisDoEmail.intervaloHoras <= proc.PONTE_HORAS_MAX);
    });

    it('sends N1 instead of WA2 when there is no signal', () => {
        const feitos = [
            { passo: 'EMAIL1', estado: 'feito', executado_em: '2026-09-09T08:30:00.000Z' },
            { passo: 'WA1', estado: 'feito', executado_em: '2026-09-09T13:30:00.000Z' },
            { passo: 'LIG1', estado: 'feito', executado_em: '2026-09-11T09:00:00.000Z' }
        ];
        const semSinal = proc.nextTouch({ estado: 'EM_SEQUENCIA', toques: feitos, processo: { sinal: false } });
        assert.equal(semSinal.passo, 'N1');
        const comSinal = proc.nextTouch({ estado: 'EM_SEQUENCIA', toques: feitos, processo: { sinal: true } });
        assert.equal(comSinal.passo, 'WA2');
    });

    it('marks LIG2 skipped without a signal, and the queue moves to Email 2 on its own', () => {
        const db = openMemoryDb();
        const leadId = seedLead(db);
        const base = [
            { passo: 'EMAIL1', canal: 'email' },
            { passo: 'WA1', canal: 'whatsapp' },
            // Two unanswered attempts close the call step.
            { passo: 'LIG1', canal: 'ligacao', resultado: 'nao_atendeu', estado: 'falhado' },
            { passo: 'LIG1', canal: 'ligacao', resultado: 'nao_atendeu', estado: 'falhado' },
            { passo: 'N1', canal: 'whatsapp' }
        ];
        base.forEach((t) => proc.registarToque(db, leadId, { estado: 'feito', ...t }));

        const depois = proc.recomputeProcesso(db, leadId);
        assert.equal(depois.processo.sinal, false);
        assert.equal(depois.proxima.passo, 'EMAIL2');
        assert.equal(depois.proxima.saltar, false);
        assert.ok(depois.proxima.agendadoPara);

        const saltado = proc.listToques(db, leadId).find((t) => t.passo === 'LIG2');
        assert.equal(saltado.estado, 'saltado');
        assert.equal(saltado.resultado, 'sem_sinal');
        db.close();
    });

    it('routes a visit to WA3 two hours later', () => {
        const proxima = proc.nextTouch({
            estado: 'VISITA',
            toques: [{ passo: 'VISITA', estado: 'feito', executado_em: '2026-09-09T08:00:00.000Z' }]
        });
        assert.equal(proxima.passo, 'WA3');
        assert.equal(proxima.intervaloHoras, 2);
        assert.ok(proxima.agendadoPara);
    });
});

describe('digitalizept lead process — contadores e bloqueios', () => {
    it('counts attempts per step and calls to the shop number per week separately', () => {
        const agora = '2026-09-16T10:00:00.000Z';
        const toques = [
            { passo: 'LIG1', canal: 'ligacao', estado: 'falhado', destino: 'negocio', executado_em: '2026-09-14T10:00:00.000Z' },
            { passo: 'LIG1', canal: 'ligacao', estado: 'feito', destino: 'negocio', executado_em: '2026-09-15T10:00:00.000Z' },
            { passo: 'D1', canal: 'ligacao', estado: 'feito', destino: 'negocio', executado_em: '2026-08-01T10:00:00.000Z' }
        ];
        assert.equal(proc.tentativasDoPasso(toques, 'LIG1'), 2);
        assert.equal(proc.tentativasDoPasso(toques, 'LIG2'), 0);
        // The old August call is outside the seven days.
        assert.equal(proc.chamadasNegocioNaSemana(toques, agora), 2);
    });

    it('blocks the call until the owner surname is confirmed', () => {
        const semApelido = proc.bloqueios({
            estado: 'DESCOBERTA',
            processo: { apelidoConfirmado: false },
            passo: 'D1'
        });
        assert.ok(semApelido.some((b) => b.id === 'apelido'));

        const comApelido = proc.bloqueios({
            estado: 'DESCOBERTA',
            processo: { apelidoConfirmado: true },
            passo: 'D1'
        });
        assert.equal(comApelido.length, 0);

        // A WhatsApp step is not gated by the surname.
        const whats = proc.bloqueios({ estado: 'EM_SEQUENCIA', processo: {}, passo: 'WA1' });
        assert.equal(whats.length, 0);
    });

    it('blocks a refusal without a date, a repeated final offer, and every channel after REMOVER', () => {
        assert.ok(proc.bloqueios({ estado: 'RECUSADO', processo: {}, passo: 'R1' })
            .some((b) => b.id === 'sem_revisita'));
        assert.equal(
            proc.bloqueios({ estado: 'RECUSADO', processo: {}, passo: 'R1', revisitarEm: '2026-12-01' })
                .some((b) => b.id === 'sem_revisita'),
            false
        );
        assert.ok(proc.bloqueios({
            estado: 'ADORMECIDO',
            processo: { ofertaFinalEnviada: true },
            passo: 'R1'
        }).some((b) => b.id === 'oferta_repetida'));

        const removido = proc.bloqueios({ estado: 'REMOVIDO', processo: { apelidoConfirmado: true }, passo: 'WA1' });
        assert.equal(removido.length, 1);
        assert.equal(removido[0].id, 'removido');
    });
});

describe('digitalizept lead process — registo', () => {
    it('stores the text actually sent and recomputes state and schedule', () => {
        const db = openMemoryDb();
        const leadId = seedLead(db);
        const texto = 'Bom dia, Sr. Costa. Mandei-lhe um email hoje de manhã.';
        const snapshot = proc.registarToque(db, leadId, {
            passo: 'WA1',
            canal: 'whatsapp',
            estado: 'feito',
            resultado: 'enviado',
            texto,
            lang: 'pt'
        });
        assert.equal(snapshot.estado, 'EM_SEQUENCIA');
        const toques = proc.listToques(db, leadId);
        assert.equal(toques.length, 1);
        assert.equal(toques[0].texto, texto);
        assert.equal(toques[0].ordem, 1);
        assert.ok(toques[0].executado_em);
        const row = db.prepare('SELECT processo_estado, proxima_acao_em FROM lead WHERE id = ?').get(leadId);
        assert.equal(row.processo_estado, 'EM_SEQUENCIA');
        assert.ok(row.proxima_acao_em);
        db.close();
    });

    it('mirrors the closing state onto the legacy resultado', () => {
        const db = openMemoryDb();
        const leadId = seedLead(db);
        proc.registarToque(db, leadId, {
            passo: 'R1',
            canal: 'whatsapp',
            estado: 'feito',
            resultado: 'nao_agora',
            proximoEstado: 'ADORMECIDO',
            revisitarEm: '2026-12-01T09:00:00.000Z',
            processo: { ofertaFinalEnviada: true, precoCongelado: 490, referenciaPedida: 'Sim' }
        });
        const row = db.prepare('SELECT processo_estado, resultado, revisitar_em FROM lead WHERE id = ?').get(leadId);
        assert.equal(row.processo_estado, 'ADORMECIDO');
        assert.equal(row.resultado, 'futuro');
        assert.equal(row.revisitar_em, '2026-12-01T09:00:00.000Z');
        const processo = proc.parseProcesso(
            db.prepare('SELECT processo_json FROM lead WHERE id = ?').get(leadId).processo_json
        );
        assert.equal(processo.ofertaFinalEnviada, true);
        assert.equal(processo.precoCongelado, 490);
        db.close();
    });

    it('builds the WA1 bridge line only from a sent Email 1', () => {
        const semNada = proc.pontEmailFor([], 'pt');
        assert.equal(semNada.pontEmailFrase, '');

        const falhado = proc.pontEmailFor([{ passo: 'EMAIL1', estado: 'falhado', executado_em: new Date().toISOString() }], 'pt');
        assert.equal(falhado.pontEmailFrase, '');

        const feito = proc.pontEmailFor(
            [{ passo: 'EMAIL1', estado: 'feito', executado_em: new Date().toISOString() }],
            'pt'
        );
        assert.match(feito.pontEmail, /Mandei-lhe um email/);
        assert.match(feito.pontEmailFrase, /^ /);

        const en = proc.pontEmailFor(
            [{ passo: 'EMAIL1', estado: 'feito', executado_em: new Date().toISOString() }],
            'en'
        );
        assert.match(en.pontEmail, /I sent you an email/);
    });
});

describe('digitalizept lead process — instruções e demo', () => {
    it('carries guidance for every step in the plan', () => {
        ['EMAIL1', 'WA1', 'LIG1', 'WA2', 'N1', 'LIG2', 'EMAIL2', 'WA3', 'R1', 'REVISITA', 'D1', 'D2', 'D3', 'D4'].forEach((passo) => {
            const guia = proc.instrucoesFor(passo);
            assert.ok(guia, `falta instrução para ${passo}`);
            assert.ok(guia.titulo && guia.objetivo && guia.registar, `instrução incompleta em ${passo}`);
        });
        assert.ok(proc.resultadosFor('LIG1').some((r) => r.id === 'funcionario'));
    });

    it('leaves the demo page without any sending panel', () => {
        const demo = fs.readFileSync(
            path.join(__dirname, '..', '..', 'digitalizept', 'js', 'steps', 'demo.js'),
            'utf8'
        );
        assert.doesNotMatch(demo, /renderFollowupShare/);
        assert.doesNotMatch(demo, /followup-ui/);
        assert.match(demo, /controlo da lead/i);
    });

    it('ships the panel in the service worker shell', () => {
        const sw = fs.readFileSync(
            path.join(__dirname, '..', '..', 'digitalizept', 'sw.js'),
            'utf8'
        );
        assert.match(sw, /digitalizept-v\d+/);
        assert.match(sw, /admin-lead-process\.js/);
        const adminHtml = fs.readFileSync(
            path.join(__dirname, '..', '..', 'digitalizept', 'admin.html'),
            'utf8'
        );
        assert.match(adminHtml, /data-tab="metricas"/);
        const panel = fs.readFileSync(
            path.join(__dirname, '..', '..', 'digitalizept', 'js', 'admin-lead-process.js'),
            'utf8'
        );
        assert.match(panel, /lead-proc-guiao/);
        assert.match(panel, /filtrosAtendedor/);
        assert.match(panel, /paintStatus/);
        assert.match(panel, /COMO_FAZER/);
        assert.match(panel, /Abre o email → envia → toca em Enviar email/);
        assert.match(panel, /Abertura desta lead/);
        assert.doesNotMatch(panel, /aberturaHost/);
        const ficha = fs.readFileSync(
            path.join(__dirname, '..', '..', 'digitalizept', 'js', 'admin-lead.js'),
            'utf8'
        );
        assert.match(ficha, /dossier-toggle/);
        assert.match(ficha, /vista === 'ficha'/);
        assert.match(ficha, /statusHost/);
        assert.match(ficha, /Dados da loja/);
        assert.match(ficha, /O que fazer agora/);
        assert.match(ficha, /dossier-mais/);
        assert.match(ficha, /Faz só o que está em baixo/);
        assert.doesNotMatch(ficha, /aberturaHost/);
        const adminCss = fs.readFileSync(
            path.join(__dirname, '..', '..', 'digitalizept', 'admin.css'),
            'utf8'
        );
        assert.doesNotMatch(adminCss, /procpasso/);
        assert.match(sw, /digitalizept-v94/);
    });
});

describe('digitalizept lead process — janelas por categoria', () => {
    it('keeps emails at 09:30 even when the category does not call in the morning', () => {
        const janelas = proc.janelaDaCategoria('restaurante');
        const proxima = proc.nextTouch({
            estado: 'DEMO_PRONTO',
            contacto: { email: 'a@b.pt' },
            agora: '2026-09-09T06:00:00.000Z',
            janelas
        });
        assert.equal(proxima.passo, 'EMAIL1');
        const parts = proc.lisbonParts(new Date(proxima.agendadoPara));
        assert.equal(parts.hour, 9);
        assert.equal(parts.minute, 30);
    });

    it('pushes WhatsApp and calls into the category window, under the global exclusions', () => {
        const restaurante = proc.janelaDaCategoria('restaurante');
        assert.equal(proc.slotIsAllowed(new Date(proc.isoAtLisbon(2026, 9, 9, 10, 0)), restaurante), false);
        assert.equal(proc.slotIsAllowed(new Date(proc.isoAtLisbon(2026, 9, 9, 15, 30)), restaurante), true);

        const mecanico = proc.janelaDaCategoria('mecanico-automovel');
        assert.equal(proc.slotIsAllowed(new Date(proc.isoAtLisbon(2026, 9, 9, 9, 0)), mecanico), true);
        assert.equal(proc.slotIsAllowed(new Date(proc.isoAtLisbon(2026, 9, 9, 11, 0)), mecanico), false);

        const salao = proc.janelaDaCategoria('salao-beleza');
        // Saturday is out even if the hour would otherwise fit.
        assert.equal(proc.slotIsAllowed(new Date(proc.isoAtLisbon(2026, 9, 12, 10, 30)), salao), false);
    });

    it('skips the two weeks before Christmas for retail, into January', () => {
        const janelas = proc.janelaDaCategoria('mercadinho');
        const iso = proc.proximaAcaoEm(proc.isoAtLisbon(2026, 12, 16, 10, 0), 0, { janelas });
        const parts = proc.lisbonParts(new Date(iso));
        assert.equal(parts.y, 2027);
        assert.equal(parts.m, 1);
        assert.ok(parts.d >= 2);
        assert.ok(proc.slotIsAllowed(new Date(iso), janelas));
    });
});

describe('digitalizept lead process — ciclo D', () => {
    it('starts on D1 when there is only a shop landline', () => {
        const proxima = proc.nextTouch({
            estado: 'DESCOBERTA',
            contacto: { tipoNumero: '2x' },
            agora: '2026-09-09T08:00:00.000Z'
        });
        assert.equal(proxima.passo, 'D1');
        assert.equal(proxima.canal, 'ligacao');
    });

    it('skips D2 until a better hour exists, then D4 without email archives the lead', () => {
        const db = openMemoryDb();
        const leadId = seedLead(db, { email: '', telefone: '222000111', demo: 'loja-x' });
        const primeiro = proc.recomputeProcesso(db, leadId);
        assert.equal(primeiro.estado, 'DESCOBERTA');
        assert.equal(primeiro.proxima.passo, 'D1');

        proc.registarToque(db, leadId, {
            passo: 'D1',
            canal: 'ligacao',
            estado: 'feito',
            resultado: 'funcionario',
            destino: 'negocio'
        });
        const semHora = proc.recomputeProcesso(db, leadId);
        assert.equal(semHora.proxima.passo, 'D3');

        proc.recomputeProcesso(db, leadId, { patchProcesso: { melhorHora: '16h' } });
        const comHora = proc.recomputeProcesso(db, leadId);
        assert.equal(comHora.proxima.passo, 'D2');
        assert.equal(proc.ancoraDeMelhorHora('16h').hour, 16);

        proc.registarToque(db, leadId, {
            passo: 'D2',
            canal: 'ligacao',
            estado: 'feito',
            resultado: 'funcionario',
            destino: 'negocio'
        });
        proc.registarToque(db, leadId, {
            passo: 'D3',
            canal: 'visita',
            estado: 'feito',
            resultado: 'mostrou'
        });
        const fim = proc.recomputeProcesso(db, leadId);
        assert.equal(fim.estado, 'ADORMECIDO');
        const saltados = proc.listToques(db, leadId).filter((t) => t.estado === 'saltado').map((t) => t.passo);
        assert.ok(saltados.includes('D4'));
        assert.ok(saltados.includes('D_FIM'));
        db.close();
    });

    it('leaves discovery when the call gets a direct channel', () => {
        const db = openMemoryDb();
        const leadId = seedLead(db, { email: '', telefone: '222000111', demo: 'loja-y' });
        const snap = proc.registarToque(db, leadId, {
            passo: 'D1',
            canal: 'ligacao',
            estado: 'feito',
            resultado: 'canal_direto'
        });
        assert.equal(snap.processo.canalDireto, true);
        assert.equal(snap.estado, 'EM_SEQUENCIA');
        assert.equal(snap.proxima.passo, 'WA1');
        const email1 = proc.listToques(db, leadId).find((t) => t.passo === 'EMAIL1');
        assert.equal(email1.estado, 'saltado');
        db.close();
    });

    it('turns a street visit into VISITA and schedules WA3', () => {
        const db = openMemoryDb();
        const leadId = seedLead(db);
        const snap = proc.registarVisitaRua(db, leadId, { experiencia: 'Mostrei no tablet' });
        assert.equal(snap.estado, 'VISITA');
        assert.equal(snap.proxima.passo, 'WA3');
        db.close();
    });

    it('sends WA3 after discovery gets a direct channel on the visit', () => {
        const db = openMemoryDb();
        const leadId = seedLead(db, { email: '', telefone: '222000111', demo: 'loja-wa3' });
        proc.registarToque(db, leadId, {
            passo: 'D1',
            canal: 'ligacao',
            estado: 'feito',
            resultado: 'funcionario',
            destino: 'negocio'
        });
        const snap = proc.registarToque(db, leadId, {
            passo: 'D3',
            canal: 'visita',
            estado: 'feito',
            resultado: 'canal_direto'
        });
        assert.equal(snap.estado, 'VISITA');
        assert.equal(snap.proxima.passo, 'WA3');
        db.close();
    });

    it('opens the close step after LIG2 is a no', () => {
        const db = openMemoryDb();
        const leadId = seedLead(db);
        proc.registarToque(db, leadId, { passo: 'EMAIL1', canal: 'email', estado: 'feito' });
        proc.registarToque(db, leadId, { passo: 'WA1', canal: 'whatsapp', estado: 'feito' });
        proc.registarToque(db, leadId, {
            passo: 'LIG1',
            canal: 'ligacao',
            estado: 'feito',
            resultado: 'viu'
        });
        proc.registarToque(db, leadId, { passo: 'WA2', canal: 'whatsapp', estado: 'feito' });
        const snap = proc.registarToque(db, leadId, {
            passo: 'LIG2',
            canal: 'ligacao',
            estado: 'feito',
            resultado: 'e_nao'
        });
        assert.equal(snap.estado, 'RECUSADO');
        assert.equal(snap.proxima.passo, 'R1');
        db.close();
    });
});

describe('digitalizept lead process — guião, objeções e métricas', () => {
    it('fills the call script and lists objections with a revisit hint', () => {
        const guiao = proc.guiaoFor('LIG1', { clienteNome: 'Costa', vendedorNome: 'Túlio', zona: 'Porto' });
        assert.match(guiao.abertura, /Costa/);
        assert.ok(guiao.ramos.some((r) => r.id === 'viu'));
        const obj = proc.listObjecoes('pt');
        assert.ok(obj.some((o) => o.id === 'preco' && o.revisitarMeses === 6));
        assert.ok(proc.filtrosAtendedor({ negocioNome: 'Talho X' }).some((f) => /Talho X/.test(f.resposta)));
    });

    it('computes reply and signal rates from the touches already stored', () => {
        const db = openMemoryDb();
        const leadId = seedLead(db);
        proc.registarToque(db, leadId, { passo: 'WA1', canal: 'whatsapp', estado: 'feito', resultado: 'enviado' });
        proc.registarToque(db, leadId, { passo: 'WA1', canal: 'whatsapp', estado: 'feito', resultado: 'respondeu' });
        const m = proc.computeMetricas(db);
        assert.equal(m.geral.leads, 1);
        assert.equal(m.geral.wa1, 1);
        assert.equal(m.geral.respostas, 1);
        assert.equal(m.geral.respostaPct, 100);
        assert.equal(m.alertas.length, 0);
        db.close();
    });

    it('stamps the seller on the touch and splits rates by seller, hook and signal origin', () => {
        const db = openMemoryDb();
        const a = seedLead(db, { email: 'a@x.pt', demo: 'loja-a' });
        const b = seedLead(db, { email: 'b@x.pt', demo: 'loja-b' });
        proc.registarToque(db, a, {
            passo: 'WA1', canal: 'whatsapp', estado: 'feito', resultado: 'enviado', vendedor: 'Túlio'
        });
        proc.registarToque(db, a, {
            passo: 'WA1', canal: 'whatsapp', estado: 'feito', resultado: 'respondeu'
        });
        proc.registarToque(db, b, {
            passo: 'WA1', canal: 'whatsapp', estado: 'feito', resultado: 'enviado', vendedor: 'Maria'
        });
        const herdado = proc.listToques(db, a).find((t) => t.resultado === 'respondeu');
        assert.equal(herdado.vendedor, 'Túlio');
        db.prepare('UPDATE lead SET followup_json = ? WHERE id = ?')
            .run(JSON.stringify({ ganchoId: 'B' }), a);
        const m = proc.computeMetricas(db);
        assert.equal(m.porVendedor['Túlio'].respostaPct, 100);
        assert.equal(m.porVendedor.Maria.respostaPct, 0);
        assert.equal(m.porGancho.B.wa1, 1);
        assert.equal(m.porOrigem.respondeu, 1);
        assert.equal(m.nomes.ganchos.B, 'Só redes');
        db.close();
    });

    it('diagnoses the hook when demos open and nobody replies', () => {
        const db = openMemoryDb();
        for (let i = 0; i < 10; i++) {
            const id = seedLead(db, { email: `n${i}@x.pt`, demo: `n${i}` });
            proc.registarToque(db, id, {
                passo: 'WA1', canal: 'whatsapp', estado: 'feito', resultado: 'enviado', vendedor: 'Túlio'
            });
            proc.registarVisitaDemo(db, { leadId: id, userAgent: CHROME_UA });
            proc.recomputeProcesso(db, id);
        }
        const m = proc.computeMetricas(db);
        assert.equal(m.geral.wa1, 10);
        assert.ok(m.geral.respostaPct < proc.LIMIAR_RESPOSTA_PCT);
        assert.equal(m.porOrigem.visitou_demo, 10);
        assert.ok(m.diagnostico.some((d) => d.id === 'gancho_ou_lista'));
        assert.ok(m.alertas.some((d) => d.id === 'gancho_ou_lista'));
        db.close();
    });
});
