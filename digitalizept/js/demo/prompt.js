// Builds the strict content-generation prompt from everything collected.
// The output contract is fixed: the external LLM must return ONLY the JSON below,
// which demo/parse.js then validates section by section.

export const SECTION_LIMITS = {
    hero: { titulo: 60, subtitulo: 120, cta: 24 },
    sobre: { titulo: 40, texto: 400 },
    servicos: { titulo: 40, nome: 40, descricao: 120, minItens: 3, maxItens: 6 },
    diferenciais: { titulo: 40, item: 80, minItens: 3, maxItens: 4 },
    problemas: { titulo: 40, item: 80, minItens: 3, maxItens: 4 },
    avaliacoes: { texto: 160, autor: 40, minItens: 2, maxItens: 3 },
    rodape: { texto: 160 }
};

const ARCHETYPE_HINTS = {
    food: 'Enfatiza especialidade, ambiente e vontade de ir/reservar. CTA natural: reservar, ver menu, ou como chegar.',
    beleza: 'Enfatiza serviços, resultados e marcação fácil. CTA natural: marcar, ver trabalhos.',
    servico: 'Estrutura problema → solução → confiança → orçamento. CTAs: pedir orçamento, ligar.',
    retail: 'Mostra o que se encontra na loja, proximidade e horário. Sem inventar loja online. CTAs: visitar, ligar, Instagram se fizer sentido.',
    premium: 'Tom sóbrio e elegante, pouco texto, foco em coleções/confiança. CTAs discretos: visitar loja, marcar exame, ver coleções.'
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

function suggestedCtas(businessType) {
    const ctas = Array.isArray(businessType.ctas_hero) ? businessType.ctas_hero : [];
    if (!ctas.length) return 'Contactar';
    return ctas.map((c) => c.label || c).filter(Boolean).join(' / ');
}

export function buildPrompt(state) {
    const businessType = state.data.businessType || {};
    const dados = state.data.dados || {};
    const archetype = businessType.archetype || 'servico';
    const archHint = ARCHETYPE_HINTS[archetype] || ARCHETYPE_HINTS.servico;

    const contextLines = [
        line('Tipo de negócio', businessType.nome),
        line('Arquétipo visual', archetype),
        line('Nome do negócio', dados.nome_negocio),
        line('Cidade', dados.cidade),
        line('O que faz', dados.o_que_faz),
        line('Principais serviços', dados.principais_servicos),
        line('Principal diferencial', dados.diferencial),
        line('Público-alvo', businessType.publico_alvo),
        line('Serviços típicos do setor', joinList(businessType.servicos_tipicos)),
        line('Diferenciais comuns do setor', joinList(businessType.diferenciais_sugeridos)),
        line('Palavras-chave locais', joinList(businessType.palavras_chave)),
        line('CTAs preferidos', suggestedCtas(businessType)),
        line('Horário', dados.horario),
        line('Cores (base / destaque / secundária)', (() => {
            const c = state.data.identidade && state.data.identidade.cores;
            return c && c.base ? `${c.base} / ${c.destaque} / ${c.secundaria}` : '';
        })())
    ].filter(Boolean).join('\n');

    const specific = specificAnswers(businessType, dados);
    const tom = businessType.tom || 'claro e próximo';
    const contexto = businessType.prompt_contexto || '';
    const needProblemas = archetype === 'servico'
        || (Array.isArray(businessType.seccoes_landing) && businessType.seccoes_landing.includes('problemas'));

    return `És um copywriter especializado em pequenos negócios em Portugal. Escreves em português europeu (de Portugal), com um tom ${tom}.

${contexto}

ORIENTAÇÃO DO ARQUÉTIPO (${archetype})
${archHint}

CONTEXTO DO NEGÓCIO
${contextLines}${specific ? `\n${specific}` : ''}

TAREFA
Devolve UM objeto JSON. Nada antes, nada depois. Sem markdown. Sem blocos de código. Sem comentários.
O texto deve parecer um website real deste negócio — nunca digas template, demonstração, exemplo ou landing page.

ASPAS
Usa apenas a aspa ASCII " (código 34) em chaves e valores.
Proibido: aspas curvas, « », ou aspas tipográficas.
Não uses aspas dentro dos textos. Se precisares de ênfase, usa travessão ou vírgulas.

FORMA ACEITE
{
  "hero": { "titulo": string máx ${SECTION_LIMITS.hero.titulo}, "subtitulo": string máx ${SECTION_LIMITS.hero.subtitulo}, "cta": string máx ${SECTION_LIMITS.hero.cta} },
  "sobre": { "titulo": string máx ${SECTION_LIMITS.sobre.titulo}, "texto": string máx ${SECTION_LIMITS.sobre.texto} },
  "servicos": { "titulo": string máx ${SECTION_LIMITS.servicos.titulo}, "itens": [ { "nome": string máx ${SECTION_LIMITS.servicos.nome}, "descricao": string máx ${SECTION_LIMITS.servicos.descricao} } ] },
  "diferenciais": { "titulo": string máx ${SECTION_LIMITS.diferenciais.titulo}, "itens": [ string máx ${SECTION_LIMITS.diferenciais.item} ] },
  "problemas": { "titulo": string máx ${SECTION_LIMITS.problemas.titulo}, "itens": [ string máx ${SECTION_LIMITS.problemas.item} ] },
  "avaliacoes": { "titulo": string máx 40, "itens": [ { "autor": string máx ${SECTION_LIMITS.avaliacoes.autor}, "texto": string máx ${SECTION_LIMITS.avaliacoes.texto} } ] },
  "rodape": { "texto": string máx ${SECTION_LIMITS.rodape.texto} }
}

CONTAS
- servicos.itens: ${SECTION_LIMITS.servicos.minItens} a ${SECTION_LIMITS.servicos.maxItens} objetos com nome e descricao.
- diferenciais.itens: ${SECTION_LIMITS.diferenciais.minItens} a ${SECTION_LIMITS.diferenciais.maxItens} frases.
- problemas.itens: ${needProblemas ? `${SECTION_LIMITS.problemas.minItens} a ${SECTION_LIMITS.problemas.maxItens} frases curtas (situações que o cliente resolve).` : 'opcional; se omitir, usa-se diferenciais.'}
- avaliacoes.itens: ${SECTION_LIMITS.avaliacoes.minItens} a ${SECTION_LIMITS.avaliacoes.maxItens} (plausíveis, sem inventar prémios).
- hero.cta deve alinhar com: ${suggestedCtas(businessType)}.
- Sem vírgula depois do último item de um array ou objeto.

EXEMPLO (copie a pontuação, mude o texto)
{"hero":{"titulo":"Mesa posta todos os dias","subtitulo":"Cozinha de proximidade, ambiente calmo e uma esplanada para ficar.","cta":"Reservar mesa"},"sobre":{"titulo":"À mesa","texto":"Um restaurante de bairro para almoços, jantares e encontros sem pressa."},"servicos":{"titulo":"O que servimos","itens":[{"nome":"Almoços","descricao":"Refeição de semana, perto de casa ou do trabalho."},{"nome":"Jantares","descricao":"Mesa para o fim do dia, em boa companhia."},{"nome":"Take-away","descricao":"A mesma cozinha, para levar."}]},"diferenciais":{"titulo":"Porquê vir","itens":["Cozinha de inspiração portuguesa","Produtos frescos sempre que possível","Esplanada para refeições ao ar livre"]},"problemas":{"titulo":"Para quando precisa","itens":["Quer reservar sem stress","Procura menu do dia perto","Quer levar para casa"]},"avaliacoes":{"titulo":"O que dizem","itens":[{"autor":"Ana","texto":"Ambiente acolhedor e comida bem feita."},{"autor":"João","texto":"Voltamos sempre que podemos."}]},"rodape":{"texto":"Reserve mesa ou passe quando quiser."}}

REGRAS DE CONTEÚDO
- Português de Portugal — nunca português do Brasil.
- Não inventes factos que não estejam no contexto (moradas, preços, prémios, anos).
- Usa o nome real do negócio no tom da página.
- A primeira e a última letra da resposta são { e }.`;
}
