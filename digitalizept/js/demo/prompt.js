// Builds the strict content-generation prompt from everything collected.
// The output contract is fixed: the external LLM must return ONLY the JSON below,
// which demo/parse.js then validates section by section.

export const SECTION_LIMITS = {
    hero: { titulo: 60, subtitulo: 120, cta: 24 },
    sobre: { titulo: 40, texto: 400 },
    servicos: { titulo: 40, nome: 40, descricao: 120, minItens: 3, maxItens: 6 },
    diferenciais: { titulo: 40, item: 80, minItens: 3, maxItens: 4 },
    rodape: { texto: 160 }
};

function line(label, value) {
    const v = String(value || '').trim();
    return v ? `- ${label}: ${v}` : '';
}

function joinList(value) {
    if (Array.isArray(value)) return value.filter(Boolean).join(', ');
    return String(value || '').trim();
}

function specificAnswers(businessType, dados) {
    const perguntas = Array.isArray(businessType.perguntas_especificas) ? businessType.perguntas_especificas : [];
    return perguntas
        .map((q) => {
            const answer = dados[q.id];
            if (!answer) return '';
            return `- ${q.label}: ${answer}`;
        })
        .filter(Boolean)
        .join('\n');
}

export function buildPrompt(state) {
    const businessType = state.data.businessType || {};
    const dados = state.data.dados || {};

    const contextLines = [
        line('Tipo de negócio', businessType.nome),
        line('Nome do negócio', dados.nome_negocio),
        line('Cidade', dados.cidade),
        line('O que faz', dados.o_que_faz),
        line('Principais serviços', dados.principais_servicos),
        line('Principal diferencial', dados.diferencial),
        line('Público-alvo', businessType.publico_alvo),
        line('Serviços típicos do setor', joinList(businessType.servicos_tipicos)),
        line('Diferenciais comuns do setor', joinList(businessType.diferenciais_sugeridos)),
        line('Palavras-chave locais', joinList(businessType.palavras_chave)),
        line('Horário', dados.horario)
    ].filter(Boolean).join('\n');

    const specific = specificAnswers(businessType, dados);
    const tom = businessType.tom || 'claro e próximo';
    const contexto = businessType.prompt_contexto || '';

    return `És um copywriter especializado em pequenos negócios em Portugal. Escreves em português europeu (de Portugal), com um tom ${tom}.

${contexto}

CONTEXTO DO NEGÓCIO
${contextLines}${specific ? `\n${specific}` : ''}

TAREFA
Preenche o conteúdo de uma landing page para este negócio. Responde APENAS com um objeto JSON válido — sem texto antes ou depois, sem blocos de código, sem comentários.

FORMATO EXATO (respeita os limites de caracteres de cada campo):
{
  "hero": { "titulo": "máx ${SECTION_LIMITS.hero.titulo}", "subtitulo": "máx ${SECTION_LIMITS.hero.subtitulo}", "cta": "máx ${SECTION_LIMITS.hero.cta}" },
  "sobre": { "titulo": "máx ${SECTION_LIMITS.sobre.titulo}", "texto": "máx ${SECTION_LIMITS.sobre.texto}" },
  "servicos": { "titulo": "máx ${SECTION_LIMITS.servicos.titulo}", "itens": [ { "nome": "máx ${SECTION_LIMITS.servicos.nome}", "descricao": "máx ${SECTION_LIMITS.servicos.descricao}" } ] },
  "diferenciais": { "titulo": "máx ${SECTION_LIMITS.diferenciais.titulo}", "itens": [ "máx ${SECTION_LIMITS.diferenciais.item}" ] },
  "rodape": { "texto": "máx ${SECTION_LIMITS.rodape.texto}" }
}

REGRAS
- "servicos.itens": entre ${SECTION_LIMITS.servicos.minItens} e ${SECTION_LIMITS.servicos.maxItens} itens.
- "diferenciais.itens": entre ${SECTION_LIMITS.diferenciais.minItens} e ${SECTION_LIMITS.diferenciais.maxItens} itens (frases curtas).
- Português de Portugal — nunca português do Brasil.
- Não inventes factos que não estejam no contexto (moradas, preços, prémios, anos).
- Usa o nome real do negócio.
- Não uses aspas duplas dentro dos textos.
- Responde só com o JSON, começando por { e terminando por }.`;
}
