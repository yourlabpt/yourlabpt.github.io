const fs = require('fs');
const path = require('path');

// Local stand-in for the operating model. This repo has no Notion client and
// no 03_WORK tree, so a closed deal is scaffolded as a folder the vendedor
// can pick up from: snapshot, contract copy, and a 50% entrada invoice draft.
// Syncing that folder into Notion / the real 03_WORK tree is out of band.

const WORK_ROOT = path.join(__dirname, '..', 'data', 'digitalizept-work');

function slugify(value) {
    return String(value || 'negocio')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'negocio';
}

function euros(cents) {
    return `${(Number(cents || 0) / 100).toFixed(2).replace('.', ',')} €`;
}

function scaffoldClosedDeal({
    projetoId,
    negocio,
    clienteNome,
    clienteEmail,
    verified,
    contractHtmlPath,
    contractPdfPath,
    dados,
    proposta,
    googlePresence,
    googleDiagnostico
}) {
    const folder = path.join(WORK_ROOT, `${slugify(negocio)}_${String(projetoId).slice(0, 8)}`);
    fs.mkdirSync(folder, { recursive: true });

    const snapshot = {
        projetoId,
        negocio,
        clienteNome,
        clienteEmail,
        dados: dados || {},
        proposta: proposta || {},
        googlePresence: googlePresence || null,
        googleDiagnostico: googleDiagnostico || null,
        totals: verified,
        criadoEm: new Date().toISOString()
    };
    fs.writeFileSync(path.join(folder, 'deal.json'), JSON.stringify(snapshot, null, 2));

    if (contractHtmlPath && fs.existsSync(contractHtmlPath)) {
        fs.copyFileSync(contractHtmlPath, path.join(folder, 'contrato.html'));
    }
    if (contractPdfPath && fs.existsSync(contractPdfPath)) {
        fs.copyFileSync(contractPdfPath, path.join(folder, 'contrato.pdf'));
    }

    if (googleDiagnostico || googlePresence) {
        const d = googleDiagnostico || {};
        const g = googlePresence || {};
        const lines = [
            `# Checklist Presença Google — ${negocio}`,
            ``,
            `## Diagnóstico (venda)`,
            `- Maps: ${d.maps || g.mapsEstado || '—'}`,
            `- Validado: ${d.validado || '—'}`,
            `- Website: ${d.website || g.website || '—'}`,
            `- Prioridade: ${d.prioridade || '—'}`,
            `- Pacote sugerido: ${d.pacoteSugerido || '—'}`,
            `- Pacote contratado: ${(proposta && proposta.pacote) || '—'}`,
            ``,
            `## Execução (0→100)`,
            `- [ ] 1 Conta Google (Gmail + 2FA)`,
            `- [ ] 2 Criar / reivindicar / pedir acesso`,
            `- [ ] 3 Dados base (nome, categoria, morada, pin, tel, horário, descrição)`,
            `- [ ] 4 Visuais (logo, capa, fachada, interior)`,
            `- [ ] 5 Validação (orientação; prazo Google)`,
            `- [ ] 6 Perfil 100% (se pacote Completo / extra)`,
            `- [ ] 7 Website (se contratado)`,
            `- [ ] 8 Confirmar pin Maps`,
            `- [ ] 9 Reviews (orientação ou mensal)`,
            `- [ ] 10 Manutenção mensal (se contratada)`,
            ``,
            `- Categoria (checklist tipo): ${g.categoria || '—'}`,
            `- Atributos: ${(g.atributos || []).join(', ') || '—'}`,
            `- Fotos: ${g.fotos || '—'}`,
            ``,
            `Conta Google: sempre do cliente. Sem API — executar no browser.`,
            ``
        ];
        fs.writeFileSync(path.join(folder, 'google-checklist.md'), lines.join('\n'));
    }

    const invoice = [
        `# Fatura-rascunho — entrada 50%`,
        ``,
        `- Cliente: ${clienteNome}`,
        `- Email: ${clienteEmail}`,
        `- Negócio: ${negocio}`,
        `- Projeto: ${projetoId}`,
        `- Total c/ IVA: ${euros(verified.totalComIva)}`,
        `- IVA: ${euros(verified.iva)} (taxa ${Math.round((verified.ivaRate || 0) * 100)}%)`,
        `- Entrada (50%): ${euros(verified.entrada)}`,
        `- Restante na entrega: ${euros(verified.final)}`,
        ``,
        `Rascunho gerado na assinatura. Emitir a fatura real no software de faturação.`,
        ``
    ].join('\n');
    fs.writeFileSync(path.join(folder, 'INVOICE-ENTRADA.md'), invoice);

    const readme = [
        `# ${negocio}`,
        ``,
        `Projeto ${projetoId}. Contrato assinado. Pasta local equivalente a 03_WORK.`,
        `Não há integração Notion neste repositório — copiar para Street Leads / Projects à mão.`,
        ``
    ].join('\n');
    fs.writeFileSync(path.join(folder, 'README.md'), readme);

    return folder;
}

module.exports = { scaffoldClosedDeal, WORK_ROOT };
