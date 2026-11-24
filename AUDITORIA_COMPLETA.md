# Auditoria Completa do Sistema INITIUM

**Data:** 17/11/2026  
**Escopo:** frontend React/Vite, backend Node.js/WebSocket, Docker Compose, dependências, configuração de deploy e organização do projeto.  
**Tipo:** auditoria técnica, funcional, de segurança e manutenção.  
**Alterações realizadas durante a auditoria:** nenhuma.

## 1. Sumário executivo

O sistema compila e inicia corretamente. O frontend foi construído com sucesso, o backend passou na verificação de sintaxe, o Docker Compose foi validado e as dependências instaladas não apresentaram vulnerabilidades detectadas pelo `npm audit`.

Entretanto, o sistema não deve ser considerado seguro para uso em rede ou ambiente real. O principal risco é o protocolo WebSocket: a autenticação administrativa é feita no cliente, pode ser contornada, e vários comandos de alteração de estado não exigem autorização no backend.

### Classificação geral

| Área | Resultado | Classificação |
|---|---|---|
| Build frontend | Aprovado | Baixo risco |
| Sintaxe backend | Aprovado | Baixo risco |
| Dependências | Sem vulnerabilidades reportadas | Baixo risco |
| Autenticação | Inadequada | Crítico |
| Autorização WebSocket | Inadequada | Crítico |
| Validação de entrada | Insuficiente | Alto |
| Persistência | Ausente | Alto |
| Testes automatizados | Ausentes | Médio |
| Deploy e exposição de rede | Incompleto | Alto |
| Organização do repositório | Necessita limpeza | Médio |

## 2. Verificações executadas

Foram executadas as seguintes verificações:

- Inspeção da estrutura de diretórios e arquivos.
- Revisão dos `package.json`, Dockerfiles, `docker-compose.yml`, configuração do Nginx e TypeScript.
- Revisão do código-fonte do frontend e backend.
- Busca por credenciais, tokens, mecanismos de autenticação, armazenamento local e comandos WebSocket.
- Build de produção do frontend:

  ```text
  npm run build
  Resultado: aprovado
  ```

- Verificação de sintaxe do backend:

  ```text
  node --check Backend/realtime.mjs
  Resultado: aprovado
  ```

- Auditoria de dependências:

  ```text
  npm --prefix Frontend audit --omit=dev --audit-level=moderate
  npm --prefix Backend audit --omit=dev --audit-level=moderate
  Resultado: 0 vulnerabilidades encontradas
  ```

- Validação do Docker Compose:

  ```text
  docker compose config
  Resultado: configuração válida
  ```

- Teste funcional local de conexão e comando WebSocket.

## 3. Achados críticos

### 3.1 Autenticação administrativa somente no frontend

**Severidade:** Crítica  
**Arquivos:** `Frontend/src/components/AdminPanel.tsx`

O painel administrativo usa uma senha fixa no código-fonte:

```ts
if (adminSenha === "admin") {
```

A sessão é mantida com um valor em `localStorage`:

```ts
localStorage.setItem(ADMIN_SESSION_KEY, "authenticated");
```

Isso não constitui autenticação segura. Qualquer usuário pode:

- visualizar a senha no bundle JavaScript;
- alterar o `localStorage` pelo DevTools;
- acessar diretamente a rota `/admin`;
- enviar comandos ao backend sem passar pelo painel.

**Impacto:** acesso administrativo completo e manipulação do laboratório.

**Recomendação:** mover a autenticação para o backend, usando credenciais configuradas fora do código, sessões ou tokens assinados, expiração, proteção contra tentativas repetidas e logout revogável.

### 3.2 Autorização WebSocket baseada em valor controlado pelo cliente

**Severidade:** Crítica  
**Arquivo:** `Backend/realtime.mjs`

O backend verifica somente se o payload contém:

```js
command.adminOperator === "ADMIN"
```

Como esse campo é enviado pelo próprio cliente, qualquer conexão pode forjar o valor. O teste funcional local confirmou que um cliente WebSocket consegue enviar um comando `start` com `adminOperator: "ADMIN"` e alterar o estado global.

**Impacto:** qualquer cliente com acesso à porta 8787 pode iniciar, reiniciar ou finalizar o laboratório.

**Recomendação:** autenticar a conexão antes de aceitar comandos e validar permissões no servidor. O nome do operador deve ser apenas informação de apresentação, nunca uma credencial.

### 3.3 Mensagens de alteração sem autorização

**Severidade:** Crítica  
**Arquivo:** `Backend/realtime.mjs`

Os seguintes tipos podem alterar o estado global sem autenticação ou autorização:

- `PLAYER_UPSERT`
- `PLAYERS_RESET`
- `SCORE_UPSERT`
- `LAB_STATE`
- `PLAYERS_UPDATE`
- `SCORES_UPDATE`

Um cliente comum pode, por exemplo, limpar jogadores, alterar pontuações ou substituir o estado do laboratório.

**Recomendação:** definir uma matriz de permissões por mensagem. Comandos de administração devem aceitar somente sessões administrativas válidas; jogadores devem poder enviar apenas os eventos estritamente necessários para sua própria sessão.

## 4. Achados de alto risco

### 4.1 Serviço WebSocket exposto diretamente

**Severidade:** Alta  
**Arquivo:** `docker-compose.yml`

O serviço publica diretamente:

```yaml
ports:
  - "8787:8787"
```

O backend escuta em `0.0.0.0`:

```yaml
REALTIME_HOST: 0.0.0.0
```

Não há autenticação de conexão, validação de `Origin`, TLS, rate limiting ou proxy reverso para o WebSocket.

**Impacto:** o serviço pode ficar acessível a qualquer origem ou rede autorizada pelo firewall, aumentando a superfície de ataque.

**Recomendação:** colocar o WebSocket atrás de HTTPS/WSS, restringir exposição de portas, validar origem e autenticação no handshake e aplicar limites de conexão e tráfego.

### 4.2 Validação de entrada insuficiente

**Severidade:** Alta  
**Arquivo:** `Backend/realtime.mjs`

O backend usa `JSON.parse`, mas não valida schema, tipos, tamanho ou campos desconhecidos. Exemplos:

- `LAB_STATE` é atribuído diretamente ao estado global.
- `SCORES_UPDATE` aceita qualquer array.
- `PLAYER_UPSERT` aceita objetos arbitrários.
- não há limite de tamanho de nome ou payload.
- não há limite de quantidade de jogadores recebidos.
- não há limite de frequência de mensagens.

A validação da duração também é incompleta:

```js
const duration = Number(command.durationSeconds);
if (typeof duration !== "number" || duration <= 0) {
```

`NaN` possui tipo `number`, mas não satisfaz a comparação `duration <= 0`.

**Impacto:** estado inconsistente, consumo excessivo de memória, abuso do serviço e possíveis falhas de lógica.

**Recomendação:** usar schemas explícitos, como validação própria ou biblioteca dedicada; rejeitar `NaN`, infinito, valores negativos e valores fora de limites operacionais; limitar payloads e frequência.

### 4.3 Estado somente em memória

**Severidade:** Alta  
**Arquivo:** `Backend/realtime.mjs`

O estado de laboratório, jogadores e pontuações é mantido em variáveis locais do processo:

```js
const state = {
  lab: ...,
  players: [],
  scores: [],
};
```

Qualquer reinício do processo ou do container perde os dados.

**Impacto:** perda de pontuações, jogadores e estado operacional após falha, deploy ou reinício.

**Recomendação:** persistir dados em banco ou armazenamento durável. Caso a operação seja temporária, implementar ao menos snapshot e restauração controlada.

### 4.4 Incompatibilidade potencial com HTTPS/WSS

**Severidade:** Alta em produção  
**Arquivos:** `Frontend/src/realtime.ts`, backend e Docker Compose

O frontend seleciona `wss:` quando a página usa HTTPS:

```ts
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
```

Porém, o backend exposto na porta 8787 oferece WebSocket sem TLS. Sem proxy reverso terminando TLS, o frontend servido por HTTPS não conseguirá conectar ao backend.

**Recomendação:** configurar WSS via proxy reverso ou fornecer TLS no serviço, além de definir explicitamente `VITE_REALTIME_URL` por ambiente.

## 5. Achados médios

### 5.1 Login de operador não é autenticação real

**Severidade:** Média/Alta  
**Arquivo:** `Frontend/src/components/LoginScreen.tsx`

As credenciais são criadas localmente e armazenadas em `localStorage`. A senha usa um hash caseiro de 32 bits, sem salt e sem mecanismo de servidor.

**Impacto:** proteção apenas visual; qualquer pessoa com acesso ao navegador pode redefinir ou alterar as credenciais.

**Recomendação:** tratar o login como autenticação do backend. Nunca armazenar credenciais ou hashes fracos no cliente para controle de acesso.

### 5.2 Ausência de testes automatizados e lint

**Severidade:** Média

Os `package.json` possuem scripts de desenvolvimento, build e execução, mas não possuem scripts de teste, lint ou typecheck independente.

**Impacto:** regressões de lógica, segurança e contrato WebSocket podem passar despercebidas.

**Recomendação:** adicionar testes unitários para regras do jogo, testes de integração para o WebSocket, lint, typecheck e pipeline de CI.

### 5.3 Artefatos gerados e dependências presentes no projeto

**Severidade:** Média

Foram encontrados, entre outros:

- `node_modules` no diretório do projeto;
- diretórios `dist` duplicados;
- imagens duplicadas;
- `REGRAS_CTF.pdf.opdownload` temporário;
- ausência de arquivos `.gitignore` identificados.

**Impacto:** projeto maior, risco de versionar artefatos locais e dificuldade de manutenção.

**Recomendação:** criar `.gitignore`, remover artefatos temporários e manter apenas fontes e arquivos de lock necessários.

### 5.4 Codificação de texto inconsistente

**Severidade:** Média

Há textos exibidos como `laboratÃ³rio`, `autorizaÃ§Ã£o` e `usuÃ¡rio`, indicando conteúdo UTF-8 interpretado como outra codificação.

**Impacto:** degradação visual e possível problema em documentação, interface e logs.

**Recomendação:** padronizar arquivos em UTF-8, revisar o pipeline de geração/cópia e validar a codificação no editor e no build.

### 5.5 Logs e observabilidade insuficientes

**Severidade:** Média

Os erros são registrados com `console.error`, sem identificador de conexão, tipo de evento, endereço de origem, correlação ou métricas.

**Impacto:** investigação de incidentes e diagnóstico operacional ficam limitados.

**Recomendação:** adicionar logging estruturado, métricas de conexões, mensagens rejeitadas, erros de validação e healthcheck real do backend.

## 6. Aspectos positivos

- Build de produção concluído sem erro.
- TypeScript configurado em modo estrito.
- Dependências com lockfiles presentes.
- Reconexão do cliente WebSocket implementada.
- O backend limita o leaderboard a oito registros.
- O frontend usa renderização React normal, sem uso identificado de `dangerouslySetInnerHTML`.
- Dockerfiles usam imagens Alpine e instalação com `npm ci`.
- A configuração do Docker Compose é sintaticamente válida.
- Nenhuma vulnerabilidade foi reportada pelo `npm audit` executado.

## 7. Plano de correção recomendado

### Fase 1 — Bloqueio imediato

1. Remover a senha fixa do frontend.
2. Implementar autenticação no backend.
3. Bloquear comandos administrativos sem autorização de servidor.
4. Bloquear `LAB_STATE`, `PLAYERS_RESET` e atualizações globais para clientes comuns.
5. Restringir a exposição da porta 8787.

### Fase 2 — Robustez do protocolo

1. Definir schemas para cada mensagem.
2. Validar tipos, campos obrigatórios e limites.
3. Rejeitar `NaN`, infinito, strings vazias e payloads excessivos.
4. Adicionar limite de mensagens por conexão.
5. Fechar conexões que enviem mensagens inválidas repetidamente.
6. Importar explicitamente `WebSocket` do pacote `ws` no backend.

### Fase 3 — Persistência e operação

1. Escolher banco ou armazenamento persistente.
2. Implementar recuperação após reinício.
3. Criar endpoint/healthcheck do backend.
4. Adicionar logs estruturados e métricas.
5. Configurar WSS, proxy reverso e variáveis por ambiente.

### Fase 4 — Qualidade e manutenção

1. Criar testes unitários e de integração.
2. Adicionar lint e typecheck ao CI.
3. Criar `.gitignore`.
4. Remover `dist`, `node_modules` e arquivos temporários do fluxo de entrega.
5. Corrigir a codificação UTF-8.

## 8. Conclusão

O INITIUM está funcional como protótipo local e a cadeia de build está saudável. A ausência de vulnerabilidades conhecidas nas dependências é positiva, mas não compensa as falhas de autenticação e autorização implementadas na camada da aplicação.

Antes de disponibilizar o sistema em rede, os controles de acesso do backend, a validação do protocolo WebSocket e a persistência devem ser tratados como bloqueadores de produção.
