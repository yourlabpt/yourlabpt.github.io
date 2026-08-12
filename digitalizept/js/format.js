export function formatEuros(centimos) {
    return (Number(centimos || 0) / 100).toLocaleString('pt-PT', {
        style: 'currency',
        currency: 'EUR'
    });
}
