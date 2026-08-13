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
Devolve UM objeto JSON. Nada antes, nada depois. Sem markdown. Sem blocos de código. Sem comentários.

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
  "rodape": { "texto": string máx ${SECTION_LIMITS.rodape.texto} }
}

CONTAS
- servicos.itens: ${SECTION_LIMITS.servicos.minItens} a ${SECTION_LIMITS.servicos.maxItens} objetos com nome e descricao.
- diferenciais.itens: ${SECTION_LIMITS.diferenciais.minItens} a ${SECTION_LIMITS.diferenciais.maxItens} frases.
- Sem vírgula depois do último item de um array ou objeto.

EXEMPLO (copie a pontuação, mude o texto)
{"hero":{"titulo":"Mesa posta todos os dias","subtitulo":"Cozinha de proximidade, ambiente calmo e uma esplanada para ficar.","cta":"Reservar mesa"},"sobre":{"titulo":"À mesa","texto":"Um restaurante de bairro para almoços, jantares e encontros sem pressa."},"servicos":{"titulo":"O que servimos","itens":[{"nome":"Almoços","descricao":"Refeição de semana, perto de casa ou do trabalho."},{"nome":"Jantares","descricao":"Mesa para o fim do dia, em boa companhia."},{"nome":"Take-away","descricao":"A mesma cozinha, para levar."}]},"diferenciais":{"titulo":"Porquê vir","itens":["Cozinha de inspiração portuguesa","Produtos frescos sempre que possível","Esplanada para refeições ao ar livre"]},"rodape":{"texto":"Reserve mesa ou passe quando quiser."}}

REGRAS DE CONTEÚDO
- Português de Portugal — nunca português do Brasil.
- Não inventes factos que não estejam no contexto (moradas, preços, prémios, anos).
- Usa o nome real do negócio.
- A primeira e a última letra da resposta são { e }.`;
}
