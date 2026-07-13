# Diário TCC Privado — PWA encriptada

PWA móvel, sem dependências externas, para registos rápidos de impulsos. Os dados são encriptados no próprio dispositivo antes de serem guardados.

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

Não existe recuperação do código mestre. Faça uma cópia encriptada regularmente.

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

- **Cópia encriptada:** inclui o cofre e a configuração; precisa do código mestre da cópia.
- **CSV legível:** serve para análise ou terapia, mas não é encriptado.
- **Importar cópia:** aceita a cópia encriptada ou o JSON simples exportado pela versão anterior.

## Atualizar a aplicação

Substitua os ficheiros no mesmo endereço. O service worker procura uma versão nova quando a aplicação volta a ter rede. O cofre permanece no armazenamento local do navegador.

## Nota clínica

A ferramenta serve como apoio de autorregisto. Não substitui acompanhamento clínico, plano de segurança ou serviço de emergência.
