// Public shopfront — enough to generate a demo and come back later for the rest.
export const PUBLIC_REQUIRED = ['nome_negocio', 'morada', 'cidade', 'telefone'];
export const PUBLIC_EXTRA = ['horario', 'whatsapp'];

export function isDataStepValid(state) {
    const businessType = state && state.data && state.data.businessType;
    if (!businessType) return false;
    const dados = (state.data && state.data.dados) || {};
    return PUBLIC_REQUIRED.every((id) => String(dados[id] || '').trim().length > 0);
}
