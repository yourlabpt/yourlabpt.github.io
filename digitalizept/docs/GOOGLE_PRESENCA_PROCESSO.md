# Processo Google Business Profile (0→100%)

Playbook operacional da Digitalize Portugal. Sem automação via Business Profile API.

## Maps vs Perfil da Empresa vs Ads

| Camada | O quê | Custo Google | YourLab |
|--------|--------|--------------|---------|
| **Google Maps** | Ficha / pin público. Pode surgir por indicação («este sítio existe») ou reivindicação; demora dias a aparecer/actualizar. | Grátis | Orientar; prazos do Google não controlamos |
| **Perfil da Empresa** (`business.google`) | Painel do dono (horário, fotos, posts, reviews, validação). Controla o que o Maps mostra. | Grátis ter e gerir | Essencial Google €290; upgrade Perfil 100% €80; ver pacotes abaixo |
| **Ads / Promover** | Anúncios pagos | Pago à Google | **Não incluído** |

## Os 10 passos

| # | Passo | O quê |
|---|-------|--------|
| 1 | Conta Google | Gmail do negócio + 2FA. Extra `conta_email_gmail` se for preciso criar. |
| 2 | Criar / reivindicar | Perfil novo, sem dono, ou pedir acesso a outro dono. |
| 3 | Dados base | Nome, categoria, morada, pin, telefone, horário, descrição. |
| 4 | Visuais | Logo, capa, fachada, interior, produtos. Extra `conteudo_visual` €40 se captar no local. |
| 5 | Validação | Cartão / vídeo / chamada — prazo do Google (tipicamente até ~5 dias úteis). Orientamos; não controlamos. |
| 6 | Perfil 100% | Serviços, produtos, atributos, links, WhatsApp, redes. |
| 7 | Website | Landing ou multipágina alinhada ao perfil. |
| 8 | Maps pin | Confirmar pin no mapa. |
| 9 | Reviews | Orientar a pedir e responder. Extra `google_avaliacoes` €25 ou mensal Maps. |
| 10 | Manutenção | Contínuo: `manutencao_maps` €10 + hosting. |

## Pacotes → cobertura

| Pacote | Código | Preço | Google | Website |
|--------|--------|-------|--------|---------|
| Essencial Google | `google_essencial` | €290 | Passos 1–5 (base) + 8 | Não |
| Site + Maps | `site_maps` | €390 | Actualizar perfil já existente (3, 7, 8) | Landing |
| Completo 0→100 | `digital_completo` | €590 | 1–6 + 8–9 orientação | Landing |
| Plus | `plus` | €990 | Arranque como Completo | Multipágina |
| Renovação | `renovacao` | €790 | Actualizar Maps | Site novo |

## Extras relevantes

- `google_perfil_completo` €80 — upgrade 100% a partir do Essencial
- `google_avaliacoes` €25 — sessão reviews
- `conteudo_visual` €40 — fotos no local
- `conta_email_gmail`, `ajuda_dominio_cliente`, `whatsapp_negocio`, `ligacao_redes`

## Mensais

| Código | Preço | O quê |
|--------|-------|--------|
| `manutencao_maps` | €10 | Horário, posts leves, fotos, respostas quando o cliente pede |
| `hosting_landing` | €5 | Hosting YourLab (landing) |
| `hosting_site` | €10 | Hosting YourLab (multipágina) |

## Fluxo na app

Tipo → Dados → **Exemplo GBP** → **Diagnóstico** → Pacote → Identidade → Demo (GBP ou landing) → Extras → Manutenção → Proposta → Aceitação → Assinatura.

Checklist operacional por deal: `google-checklist.md` na pasta de trabalho do projeto.
