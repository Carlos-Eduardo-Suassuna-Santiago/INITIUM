# INITIUM CTF

## Regulamento oficial do desafio

## 1. Objetivo

O INITIUM CTF é uma competição de resposta a incidentes e defesa cibernética baseada em um ambiente Linux simulado.

Cada participante deverá investigar servidores comprometidos, identificar indicadores de ataque, conter os vetores maliciosos e restaurar a integridade dos sistemas.

O objetivo é concluir o maior número possível de tasks com a maior pontuação, preservando a integridade operacional e o tempo disponível.

## 2. Formato da competição

- A competição possui **6 fases**.
- O desafio possui **34 tasks** no total.
- Cada fase representa uma infraestrutura crítica diferente.
- As tasks são executadas em um terminal Linux simulado.
- O progresso e a pontuação são associados ao usuário participante.
- O ranking é atualizado em tempo real.

Fases da campanha:

| Fase | Codinome | Tasks |
|---:|---|---:|
| 01 | SIGILO | 4 |
| 02 | URNA | 6 |
| 03 | FREQUÊNCIA | 6 |
| 04 | ÓRBITA | 6 |
| 05 | ABISMO | 7 |
| 06 | ATÔMICA | 5 |
| **Total** |  | **34** |

## 3. Inscrição e identificação

1. Cada participante deve utilizar uma conta individual.
2. O nome de usuário deve identificar claramente o participante ou equipe.
3. Não é permitido compartilhar uma conta entre participantes.
4. A organização pode invalidar contas duplicadas ou nomes usados para confundir o ranking.
5. O participante é responsável por manter suas credenciais em sigilo.

## 4. Início do laboratório

- O participante pode entrar no lobby antes do início.
- O laboratório só começa quando o administrador pressionar **INICIAR LABORATÓRIO**.
- Todos os participantes conectados recebem o mesmo horário oficial de início.
- O cronômetro global é controlado pelo servidor realtime.
- Entrar no lobby não consome o tempo da competição.
- Após o início, o cronômetro não é reiniciado entre as fases.

## 5. Tempo de prova

- O tempo global da campanha é de **1 hora e 30 minutos**.
- O tempo médio disponível é de aproximadamente **159 segundos por task**.
- O cronômetro é contínuo e compartilhado entre os participantes.
- Pausar a interface não interrompe o cronômetro global.
- A troca de fase não reinicia o relógio.
- Quando o tempo chega a zero, a operação é encerrada.

## 6. Como pontuar

A pontuação é atribuída quando uma task é concluída corretamente.

A classificação de velocidade segue estas faixas:

| Faixa | Tempo da task | Multiplicador |
|---|---:|---:|
| S | até 12 segundos | 3,00x |
| A | até 30 segundos | 2,20x |
| B | até 60 segundos | 1,60x |
| C | até 120 segundos | 1,15x |
| D | acima de 120 segundos | 0,75x |

A pontuação final considera:

- Pontos base da task.
- Tempo de resolução.
- Multiplicador de velocidade.
- Multiplicador de cadeia.
- Penalidades acumuladas.
- Integridade restante.
- Tempo restante ao concluir a campanha.

A pontuação exibida no painel administrativo representa o score atual do participante.

## 7. Integridade e criticidade

A barra de criticidade diminui conforme o tempo global passa.

Além do desgaste temporal, cada participante possui penalidades individuais causadas por erros operacionais.

Exemplos de penalidades:

- Consultar uma dica.
- Executar um comando inválido.
- Derrubar um processo legítimo.
- Reiniciar um serviço em condição incorreta.

A criticidade de um participante pode ser diferente da de outro, mesmo quando os cronômetros estão sincronizados.

Quando a integridade chega a zero:

- A operação do participante é considerada perdida.
- O Participante é eliminado.

## 8. Comandos e ações permitidos

Os participantes podem usar os comandos disponíveis no terminal simulado, incluindo:

- `nmap`
- `ps`
- `netstat`
- `ss`
- `ls`
- `cat`
- `tail`
- `grep`
- `whois`
- `traceroute`
- `tcpdump`
- `kill`
- `iptables`
- `ufw`
- `rm`
- `chmod`
- `ssh-keygen`
- `systemctl`
- `chkrootkit`
- `base64`

A existência de um comando não significa que qualquer argumento será aceito. O terminal simulado valida os comandos e os objetivos da fase.

## 9. Dicas

- O comando `dica` pode orientar a próxima task.
- Também é possível solicitar uma dica específica, como `dica 3`.
- O uso de dicas reduz a integridade e a pontuação da task atual.
- A dica não altera o cronômetro global.
- O participante deve decidir entre velocidade e pontuação.

## 10. Requisitos compostos

Algumas tasks possuem mais de um requisito.

Exemplos:

- Encerrar vários processos maliciosos.
- Remover vários arquivos.
- Bloquear uma porta e um IP.
- Remover um artefato e executar `chkrootkit`.
- Girar chaves antes de reiniciar um serviço.

Uma task composta só concede pontos quando todos os requisitos forem concluídos.

## 11. Condutas proibidas

É proibido:

1. Tentar acessar o computador, navegador ou conta de outro participante.
2. Compartilhar credenciais ou operar a conta de outra pessoa.
3. Interferir no servidor WebSocket ou enviar mensagens falsificadas.
4. Alterar o ranking, pontuação, cronômetro ou estado do laboratório manualmente.
5. Explorar o ambiente do CTF para atingir sistemas externos.
6. Realizar ataques de negação de serviço.
7. Automatizar tentativas que prejudiquem a disponibilidade da competição.
8. Utilizar ferramentas externas para burlar a validação das tasks.
9. Manipular arquivos locais do jogo para obter vantagem indevida.
10. Explorar vulnerabilidades da infraestrutura da organização sem autorização.

A organização pode remover imediatamente participantes que violem essas regras.

## 12. Uso de ferramentas externas

É permitido utilizar documentação e ferramentas de consulta previamente autorizadas pela organização.

Não é permitido utilizar ferramentas externas para:

- Descobrir respostas prontas das tasks.
- Alterar o estado interno do jogo.
- Simular conclusões de objetivos.
- Manipular mensagens do WebSocket.
- Automatizar comandos para obter vantagem injusta.

A organização pode definir previamente quais ferramentas são permitidas em cada edição.

## 13. Desconexões e problemas técnicos

- O participante deve comunicar problemas técnicos imediatamente à organização.
- O tempo continua correndo durante uma desconexão, salvo decisão expressa do administrador.
- O estado realtime é compartilhado pelo servidor enquanto o backend estiver disponível.
- O progresso local pode ser restaurado conforme o mecanismo de salvamento da aplicação.
- A organização pode pausar ou reiniciar o laboratório em caso de falha geral.
- Não haverá compensação automática por erro causado por configuração local do participante.

## 14. Ranking e desempate

O ranking é ordenado pela pontuação total dos participantes.

Em caso de empate, a organização deverá aplicar, nesta ordem:

1. Maior número de tasks concluídas.
2. Maior integridade restante.
3. Maior tempo restante ao final.
4. Menor quantidade de penalidades.
5. Primeiro registro confirmado pelo servidor.

A organização pode revisar resultados suspeitos antes de publicar a classificação final.

## 15. Administração do laboratório

O administrador pode:

- Iniciar o laboratório.
- Resetar o laboratório.
- Acompanhar jogadores online.
- Acompanhar pontuações em tempo real.
- Encerrar a sessão por motivo técnico ou disciplinar.
- Corrigir ou invalidar resultados comprovadamente irregulares.

O administrador não deve alterar resultados durante uma prova sem comunicar os participantes.

## 16. Encerramento

A prova termina quando ocorrer uma das situações abaixo:

- O cronômetro global chegar a zero.
- Todas as fases forem concluídas.
- O administrador encerrar oficialmente a sessão.
- A organização interromper a prova por motivo técnico ou de segurança.

Após o encerramento, novas ações não devem ser consideradas para o ranking oficial.

## 17. Aceite

Ao participar do INITIUM CTF, o participante declara que:

- Leu e compreendeu este regulamento.
- Utilizará o ambiente somente para fins autorizados.
- Respeitará os demais participantes.
- Aceitará as decisões da organização sobre validação e classificação.
- Comunicará falhas técnicas ou de segurança de forma responsável.

## 18. Contato da organização

Antes do início da competição, a organização deve divulgar:

- Canal oficial de suporte.
- Nome dos administradores responsáveis.
- Horário oficial da prova.
- Política de pausas e reinícios.
- Ferramentas externas permitidas.
- Critérios de revisão e recurso.

## 19. Escopo autorizado

Somente os hosts, serviços, arquivos e comandos apresentados dentro do ambiente INITIUM fazem parte do escopo da competição.

É proibido:

- Escanear ou atacar endereços externos ao laboratório.
- Usar os IPs e domínios fictícios do jogo contra a infraestrutura real.
- Fazer conexões para sistemas que não estejam simulados pelo terminal.
- Utilizar a rede da competição para testar terceiros.

Qualquer atividade fora do escopo pode resultar em desclassificação imediata, mesmo que não altere o ranking.

## 20. Modalidade individual

Modalidade individual:

- Cada conta representa uma única pessoa.
- Não é permitido receber comandos ou decisões de outro participante.


## 21. Evidências e auditoria

O servidor pode registrar, para fins de auditoria:

- Usuário e identificador do participante.
- Horário de conexão e primeiro registro.
- Comandos enviados ao terminal simulado.
- Tasks concluídas e requisitos atendidos.
- Pontuação, penalidades e integridade.
- Eventos de conexão, desconexão e reconexão.
- Alterações administrativas no estado do laboratório.

Os logs técnicos prevalecem sobre capturas de tela ou relatos individuais quando houver divergência de resultado.

A organização deve preservar os registros até o fim do período de recurso definido para a edição.

## 22. Bugs e falhas de segurança

Ao encontrar um comportamento inesperado, o participante deve:

1. Interromper a exploração do comportamento.
2. Registrar horário, usuário, fase e passos mínimos para reprodução.
3. Comunicar o problema pelo canal oficial.
4. Aguardar autorização antes de testar novamente.

É proibido transformar um bug conhecido em vantagem competitiva sem autorização da organização.

A organização pode invalidar pontuações obtidas por falhas não intencionais e executar um rollback do estado afetado.

## 23. Referência oficial de horário

- O horário oficial da prova é o horário do servidor realtime.
- Relógios locais dos participantes não definem início, término ou desempate.
- O `startTime` oficial é emitido pelo backend.
- Em caso de diferença visual temporária, o estado recebido do servidor prevalece.
- A organização deve informar o fuso horário usado nos comunicados e logs.

## 24. Privacidade e uso dos dados

Os dados coletados devem ser limitados ao necessário para executar e auditar a competição.

Podem ser armazenados:

- Nome de usuário ou nome da equipe.
- Pontuações e progresso.
- Logs técnicos da participação.
- Horários de conexão e eventos da prova.

A organização deve informar:

- Quem terá acesso aos logs.
- Por quanto tempo os dados serão mantidos.
- Se o ranking será publicado publicamente.
- Como solicitar correção de um dado incorreto.

Credenciais não devem ser incluídas em arquivos de log ou exportações administrativas.

## 25. Recursos e contestação

O participante pode contestar uma decisão dentro do prazo divulgado pela organização.

O recurso deve conter:

- Identificação do participante.
- Fase e task envolvidas.
- Horário aproximado do ocorrido.
- Descrição objetiva do problema.
- Evidências disponíveis, sem incluir dados de outros participantes.

A decisão da organização deve ser registrada e comunicada ao participante. Durante a análise, o resultado pode ficar marcado como provisório.

## 26. Alterações do regulamento

Qualquer alteração relevante após o início da competição deve ser comunicada a todos os participantes.

Não devem ser alteradas durante a prova, sem justificativa técnica e comunicação formal:

- Duração do laboratório.
- Critérios de pontuação.
- Critérios de desempate.
- Escopo autorizado.
- Regras de uso de ferramentas.

Alterações emergenciais para corrigir uma falha crítica devem ser registradas nos logs administrativos.
