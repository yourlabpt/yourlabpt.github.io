# Diário TCC Privado — PWA encriptada

PWA móvel, sem dependências externas, para monitoramento diário com linguagem discreta. Os dados são encriptados no próprio dispositivo antes de serem guardados.

O formulário reforça hábitos, intimidade e autocontrolo (estado, vontade do “atalho”, gatilhos, respostas, deslize com aprendizagem, positivo e gratidão), em vez de focar só em punir recaídas.

## Segurança implementada

- código mestre com pelo menos 8 caracteres;
- derivação de chave PBKDF2-SHA-256 com 600.000 iterações;
- cofre AES-GCM de 256 bits;
- passkey com verificação do utilizador e extensão WebAuthn PRF para desbloqueio por Face ID quando suportado;
- bloqueio ao sair da aplicação por cerca de 30 segundos;
- atraso progressivo depois de várias tentativas erradas;
- nenhuma biblioteca externa, conta ou serviço de análise;
- migração automática dos registos da versão anterior em texto simples para o cofre encriptado.

## Limites reais

Nenhuma aplicação é “impossível de quebrar”. Esta versão protege bem contra acesso casual, perda ou empréstimo do telemóvel e leitura direta do armazenamento do navegador. A segurança também depende de:

- um código mestre longo e não reutilizado;
- o iPhone estar atualizado e protegido por código;
- o domínio e o alojamento HTTPS não serem comprometidos;
- não exportar CSV para locais inseguros.

Não existe recuperação do código mestre. Faça uma cópia encriptada regularmente (a app pode descarregar automaticamente após cada registo e lembrar a cópia diária).

## Publicar no seu próprio link

Envie todos os ficheiros desta pasta para o alojamento numa subpasta HTTPS do seu domínio. O endereço deve usar **HTTPS** para permitir WebAuthn/Face ID e service worker.

Produção YourLab:

```text
https://yourlabpt.com/diario-tcc-secure/
```

Mantenha o mesmo domínio e caminho. A passkey fica ligada ao endereço em que foi criada. Se mudar o domínio ou o caminho, o código mestre continua a desbloquear os dados, mas será necessário ativar uma nova passkey.

### Teste local

Na pasta do projeto:

```bash
python3 -m http.server 8080
```

Abra no computador:

```text
http://localhost:8080
```

`localhost` é aceite para desenvolvimento. No iPhone, use o endereço HTTPS publicado.

## Instalar no iPhone

1. Publique a pasta num endereço HTTPS.
2. Abra o endereço no **Safari** do iPhone.
3. Toque em **Partilhar**.
4. Escolha **Adicionar ao Ecrã Principal**.
5. Abra o ícone **Diário TCC**.
6. Crie o código mestre.
7. Aceite a criação da passkey para ativar o Face ID.

O iPhone pode usar o código do próprio dispositivo quando o Face ID não estiver disponível.

## Cópias e exportações

- **Cópia após cada registo:** descarrega automaticamente a cópia encriptada quando guarda um registo (ativo por omissão; pode desligar em Dados).
- **Lembrete diário:** ao desbloquear, pede uma cópia se ainda não descarregou hoje.
- **Cópia encriptada:** inclui o cofre e a configuração; precisa do código mestre da cópia. Guarde-a fora do navegador (Ficheiros, iCloud, Drive).
- **Relatório do dia:** em Histórico ou Dados, gera texto para enviar à terapeuta (resumo se houver vários registos no mesmo dia; copiar, partilhar ou .txt).
- **Importar / recuperar cópia:** na primeira utilização use “Recuperar cópia encriptada”; com o diário já criado use Dados → “Recuperar / importar cópia”. Depois desbloqueie com o código mestre dessa cópia.

## Atualizar a aplicação

Substitua os ficheiros no mesmo endereço. O service worker procura uma versão nova quando a aplicação volta a ter rede. O cofre permanece no armazenamento local do navegador.

## Nota clínica

A ferramenta serve como apoio de autorregisto. Não substitui acompanhamento clínico, plano de segurança ou serviço de emergência.
