# INITIUM — Soluções das Tasks

> Documento de referência e spoilers da campanha. Os comandos abaixo são executados no terminal simulado do jogo.

> As fases 07 (SOBERANIA) e 08 (APOCALIPSE) estão arquivadas e não fazem parte da campanha ativa de 90 minutos.

## Regras gerais


---

## Guia dos comandos

Esta seção explica os comandos usados nas soluções. A sintaxe segue o padrão de um terminal Linux, mas os comandos são interpretados pelo shell simulado do INITIUM.

### `nmap` — descobrir portas e serviços

Exemplo:

```bash
nmap -sV localhost
```

Significado:

- `nmap`: inicia uma varredura de rede.
- `-sV`: tenta identificar a versão/serviço de cada porta.
- `localhost`: alvo da varredura. No jogo, representa o servidor da fase.

No INITIUM, esse comando marca a varredura de rede como realizada.

### `ps` — listar processos

Exemplo:

```bash
ps aux
```

Significado:

- `ps`: exibe processos em execução.
- `a`: mostra processos de todos os usuários.
- `u`: exibe informações detalhadas do usuário e consumo.
- `x`: inclui processos sem terminal associado.

Use a coluna `PID` para encontrar o número do processo malicioso antes de usar `kill`.

### `netstat` e `ss` — listar conexões e portas

Exemplos:

```bash
netstat -tulpn
ss -tulpn
```

Significado das opções:

- `-t`: conexões TCP.
- `-u`: conexões UDP.
- `-l`: apenas sockets em escuta.
- `-p`: mostra o processo associado.
- `-n`: não tenta resolver nomes; mostra números diretamente.

No jogo, `netstat` e `ss` registram que a superfície de rede foi inspecionada.

### `ls` — listar arquivos

Exemplo:

```bash
ls -la /var/www/html
```

Significado:

- `ls`: lista o conteúdo de um diretório.
- `-l`: formato detalhado, incluindo permissões, dono e tamanho.
- `-a`: inclui arquivos ocultos, como `.c99.pl` e `.fdoor`.
- `/var/www/html`: diretório analisado.

Use `ls -la` quando o artefato malicioso estiver oculto.

### `cat` — ler o conteúdo de um arquivo

Exemplo:

```bash
cat /etc/ssh/sshd_config
```

Significado:

- `cat`: imprime o conteúdo do arquivo.
- `/etc/ssh/sshd_config`: caminho absoluto do arquivo.

Também é usado para ler logs e arquivos codificados antes de aplicar outro comando.

### `tail` — ler o final de um log

Exemplo:

```bash
tail -n 20 /var/log/auth.log
```

Significado:

- `tail`: mostra o final de um arquivo.
- `-n 20`: solicita as últimas 20 linhas.
- `/var/log/auth.log`: log de autenticação SSH.

O log contém o IP usado nas tentativas de acesso.

### `grep` — filtrar linhas

Exemplo:

```bash
grep 'Failed password' /var/log/auth.log
```

Significado:

- `grep`: procura um padrão no conteúdo.
- `'Failed password'`: texto procurado.
- `/var/log/auth.log`: arquivo pesquisado.

As aspas agrupam o padrão que possui espaço.

### `whois` e `traceroute` — atribuir um IP

Exemplos:

```bash
whois 45.161.240.77
traceroute 45.161.240.77
```

Significado:

- `whois`: consulta informações de registro e proprietário do IP.
- `traceroute`: mostra o caminho percorrido até o endereço.
- `45.161.240.77`: IP do atacante da fase.

No INITIUM, qualquer um dos dois comandos marca o vetor como rastreado quando o IP está correto.

### `tcpdump` — capturar tráfego

Exemplos:

```bash
tcpdump -i eth0 host 91.219.236.10
tcpdump -i eth0 port 6667
```

Significado:

- `tcpdump`: captura e exibe pacotes.
- `-i eth0`: seleciona a interface de rede `eth0`.
- `host 91.219.236.10`: filtra tráfego de um host.
- `port 6667`: filtra tráfego de uma porta.

Basta usar um dos filtros aceitos pela task.

### `kill` — encerrar processos

Exemplo:

```bash
kill -9 31337
```

Significado:

- `kill`: envia um sinal para um processo.
- `-9`: sinal `SIGKILL`, encerramento imediato.
- `31337`: PID do processo.

Use somente os PIDs hostis indicados pela fase. Encerrar um processo legítimo causa dano colateral.

### `iptables` — criar bloqueios no firewall

Bloquear uma porta:

```bash
iptables -A INPUT -p tcp --dport 4444 -j DROP
```

Significado:

- `iptables`: gerencia regras do firewall.
- `-A INPUT`: adiciona (`Append`) uma regra à cadeia de entrada.
- `-p tcp`: limita a regra ao protocolo TCP.
- `--dport 4444`: porta TCP de destino.
- `-j DROP`: ação da regra; descarta o tráfego.

Bloquear um IP:

```bash
iptables -A INPUT -s 45.161.240.77 -j DROP
```

Neste caso, `-s` significa origem (`source`) e o valor seguinte é o IP a bloquear.

### `ufw` — alternativa simples de firewall

Bloquear uma porta:

```bash
ufw deny 4444
```

Significado:

- `ufw`: interface simplificada para o firewall.
- `deny`: nega o tráfego.
- `4444`: porta bloqueada.

Bloquear um IP:

```bash
ufw deny from 45.161.240.77
```

Aqui, `from` indica que o bloqueio é baseado na origem do tráfego.

### `rm` — remover arquivos

Exemplo:

```bash
rm -f /var/www/html/cmd.php
```

Significado:

- `rm`: remove arquivos.
- `-f`: força a remoção sem pedir confirmação.
- `/var/www/html/cmd.php`: caminho do artefato.

Para tasks compostas, execute um `rm` para cada arquivo exigido.

### `chmod` — alterar permissões

Exemplo:

```bash
chmod 600 /etc/tse/boletim.db
```

Significado:

- `chmod`: altera permissões.
- `600`: dono pode ler e escrever; grupo e demais usuários não têm acesso.
- `/etc/tse/boletim.db`: arquivo protegido.

O primeiro dígito representa o dono, o segundo o grupo e o terceiro os demais usuários.

### `ssh-keygen` — gerar chaves SSH

Exemplo:

```bash
ssh-keygen -f /etc/ssh/ssh_host_rsa_key -N ''
```

Significado:

- `ssh-keygen`: cria ou substitui chaves SSH.
- `-f`: define o caminho do arquivo da chave.
- `/etc/ssh/ssh_host_rsa_key`: chave do servidor.
- `-N ''`: define uma passphrase vazia para a simulação.

Na Fase 04, execute este comando antes de reiniciar o serviço SSH.

### `systemctl` — controlar serviços

Exemplos:

```bash
systemctl restart sshd
systemctl status sshd
```

Significado:

- `systemctl`: gerenciador de serviços.
- `restart`: reinicia o serviço.
- `status`: consulta o estado do serviço.
- `sshd`: serviço do servidor SSH.

### `chkrootkit` — validar limpeza

Exemplo:

```bash
chkrootkit
```

Significado:

- `chkrootkit`: procura sinais de rootkits e artefatos conhecidos.

No jogo, a task só reconhece a validação como limpa depois que os arquivos maliciosos exigidos foram removidos.

### `base64` — decodificar conteúdo

Exemplo:

```bash
base64 -d /var/log/.cache
```

Significado:

- `base64`: codifica ou decodifica conteúdo Base64.
- `-d`: modo decode, ou decodificação.
- `/var/log/.cache`: arquivo que contém o payload codificado.

### Comandos auxiliares

```bash
pwd
cd /var/log
file /tmp/.x/kmod
curl http://localhost/cmd.php
```

- `pwd`: mostra o diretório atual.
- `cd`: muda de diretório.
- `file`: identifica o tipo de arquivo.
- `curl`: faz uma requisição HTTP e ajuda a verificar webshells.

Esses comandos ajudam na investigação, mas só concluem uma task quando o objetivo correspondente registra explicitamente essa ação.

## Fase 01 — SIGILO

**Alvo:** `srv-br01.core.bb.gov.br`  
**Total:** 4 tasks

### 01. Mapear portas, serviços e processos expostos

Requisitos: varredura de rede e inspeção de processos.

```bash
nmap -sV localhost
ps aux
```

### 02. Encerrar o backdoor ativo

```bash
ps aux
kill -9 31337
```

### 03. Selar a porta 4444 no firewall

```bash
iptables -A INPUT -p tcp --dport 4444 -j DROP
```

Alternativa aceita:

```bash
ufw deny 4444
```

### 04. Erradicar o webshell

```bash
ls -la /var/www/html
rm -f /var/www/html/cmd.php
```

---

## Fase 02 — URNA

**Alvo:** `apur02.tse.jus.br`  
**Total:** 6 tasks

### 01. Levantar a superfície do nó

```bash
netstat -tulpn
ps aux
```

### 02. Achar o IP de ataque no log de acesso

```bash
tail -n 20 /var/log/auth.log
grep 'Failed password' /var/log/auth.log
```

Qualquer um dos comandos de log identifica o IP nesta simulação.

### 03. Atribuir o proprietário do IP hostil

```bash
whois 45.161.240.77
```

Alternativa aceita:

```bash
traceroute 45.161.240.77
```

### 04. Derrubar a rota do invasor no firewall

```bash
iptables -A INPUT -s 45.161.240.77 -j DROP
```

Alternativa aceita:

```bash
ufw deny from 45.161.240.77
```

### 05. Eliminar força bruta e exfiltração

Requisitos: encerrar os dois processos hostis.

```bash
kill -9 2402
kill -9 4096
```

### 06. Corrigir permissões do boletim

```bash
chmod 600 /etc/tse/boletim.db
```

---

## Fase 03 — FREQUÊNCIA

**Alvo:** `scada-rtu07.ons.org.br`  
**Total:** 6 tasks

### 01. Inventariar a RTU industrial

```bash
ss -tulpn
ps aux
```

### 02. Confirmar a exfiltração de pacotes

```bash
tcpdump -i eth0 host 91.219.236.10
```

Alternativa aceita:

```bash
tcpdump -i eth0 port 6667
```

### 03. Decodificar o payload hostil

```bash
cat /var/log/.cache
base64 -d /var/log/.cache
```

### 04. Neutralizar os agentes maliciosos

Requisitos: encerrar o rootkit e o shell reverso.

```bash
kill -9 5150
kill -9 5151
```

### 05. Bloquear o canal IRC de comando

```bash
iptables -A INPUT -p tcp --dport 6667 -j DROP
```

Alternativa aceita:

```bash
ufw deny 6667
```

### 06. Erradicar o rootkit e validar

Requisitos: remover o módulo oculto e confirmar a limpeza.

```bash
rm -f /tmp/.x/kmod
chkrootkit
```

---

## Fase 04 — ÓRBITA

**Alvo:** `telemetry.gsgdc.br`  
**Total:** 6 tasks

### 01. Auditar o nó de telemetria

```bash
ps aux
netstat -tulpn
```

### 02. Verificar a configuração do daemon SSH

```bash
cat /etc/ssh/sshd_config
```

Alternativa aceita:

```bash
grep PermitRootLogin /etc/ssh/sshd_config
```

### 03. Girar as chaves de acesso do satélite

```bash
ssh-keygen -f /etc/ssh/ssh_host_rsa_key -N ''
```

### 04. Reiniciar o daemon de acesso seguro

Execute depois de girar as chaves:

```bash
systemctl restart sshd
```

### 05. Expulsar sessões clandestinas

Requisitos: encerrar os dois processos invasores.

```bash
kill -9 6161
kill -9 6162
```

### 06. Fechar a porta do backconnect

```bash
iptables -A INPUT -p tcp --dport 4404 -j DROP
```

Alternativa aceita:

```bash
ufw deny 4404
```

---

## Fase 05 — ABISMO

**Alvo:** `landing-pt.cprmar.gov.br`  
**Total:** 7 tasks

### 01. Identificar todos os vetores

```bash
nmap -sV localhost
ps aux
```

### 02. Eliminar os três processos hostis

Requisitos: encerrar o backdoor, o webshell e o túnel reverso.

```bash
kill -9 7777
kill -9 8888
kill -9 9999
```

### 03. Selar a porta 4444

```bash
iptables -A INPUT -p tcp --dport 4444 -j DROP
```

Alternativa aceita:

```bash
ufw deny 4444
```

### 04. Selar a porta do túnel 9001

```bash
ufw deny 9001
```

Alternativa aceita:

```bash
iptables -A INPUT -p tcp --dport 9001 -j DROP
```

### 05. Descartar o tráfego do servidor C2

```bash
iptables -A INPUT -s 201.17.44.19 -j DROP
```

Alternativa aceita:

```bash
ufw deny from 201.17.44.19
```

### 06. Expurgar artefatos e webshells

Requisitos: remover os dois arquivos.

```bash
rm -f /var/www/html/portal.php
rm -f /var/www/html/.c99.pl
```

### 07. Validar a integridade do nó

Requisitos: remover o backdoor reverso e confirmar a limpeza.

```bash
rm -f /tmp/.x/.fdoor
chkrootkit
```

---

## Fase 06 — ATÔMICA

**Alvo:** `coolant-scada.angra.eletronuclear.gov.br`  
**Total:** 5 tasks

### 01. Varredura do sistema SCADA nuclear

```bash
nmap -sV localhost
ps aux
```

### 02. Matar o adulterador de bombas

```bash
kill -9 7102
```

### 03. Selar a porta externa 102

```bash
iptables -A INPUT -p tcp --dport 102 -j DROP
```

Alternativa aceita:

```bash
ufw deny 102
```

### 04. Restaurar permissões da configuração do reator

```bash
chmod 600 /etc/angra/coolant.conf
```

### 05. Remover o binário hostil

```bash
rm -f /tmp/.stx/stx-modbus-tamper
chkrootkit
```

A verificação do arquivo removido é feita pela própria task; `chkrootkit` é recomendado para confirmar a limpeza.

---

## Fase 07 — SOBERANIA

**Alvo:** `comdciber-gw.defesa.mil.br`  
**Total:** 6 tasks

### 01. Mapear o gateway de defesa

```bash
netstat -tulpn
ps aux
```

### 02. Derrubar o túnel WireGuard clandestino

```bash
kill -9 8200
```

### 03. Bloquear a porta 51820

```bash
iptables -A INPUT -p tcp --dport 51820 -j DROP
```

Alternativa aceita:

```bash
ufw deny 51820
```

### 04. Identificar o operador de ameaça estatal

```bash
whois 194.26.29.11
```

Alternativa aceita:

```bash
traceroute 194.26.29.11
```

### 05. Descartar pacotes da infraestrutura APT

```bash
iptables -A INPUT -s 194.26.29.11 -j DROP
```

Alternativa aceita:

```bash
ufw deny from 194.26.29.11
```

### 06. Remover o implante de memória e validar

Requisitos: remover o implante e executar a validação limpa.

```bash
rm -f /tmp/.defesa_leak
chkrootkit
```

---

## Fase 08 — APOCALIPSE

**Alvo:** `bgp-core01.rnp.br`  
**Total:** 8 tasks

### 01. Mapear o gateway central sob bombardeio

```bash
nmap -sV localhost
ps aux
```

### 02. Derrubar os processos de sequestro BGP e Flood

Requisitos: encerrar os dois processos hostis.

```bash
kill -9 9001
kill -9 9002
```

### 03. Selar a porta de envenenamento BGP 1790

```bash
iptables -A INPUT -p tcp --dport 1790 -j DROP
```

Alternativa aceita:

```bash
ufw deny 1790
```

### 04. Selar a porta de comando botnet 6666

```bash
iptables -A INPUT -p tcp --dport 6666 -j DROP
```

Alternativa aceita:

```bash
ufw deny 6666
```

### 05. Atribuir o C2 Master do ataque coordenado

```bash
whois 185.100.87.200
```

Alternativa aceita:

```bash
traceroute 185.100.87.200
```

### 06. Neutralizar a rota do C2 Master

```bash
iptables -A INPUT -s 185.100.87.200 -j DROP
```

Alternativa aceita:

```bash
ufw deny from 185.100.87.200
```

### 07. Erradicar a webshell zero-day

```bash
rm -f /var/www/html/zero_day.php
```

### 08. Certificar a soberania digital do Brasil

Requisitos: remover os dois artefatos e confirmar a limpeza.

```bash
rm -f /tmp/.x/bgp-hijack
rm -f /tmp/.x/flood-c2
chkrootkit
```

---

## Resumo

| Fase | Codinome | Tasks |
|---:|---|---:|
| 01 | SIGILO | 4 |
| 02 | URNA | 6 |
| 03 | FREQUÊNCIA | 6 |
| 04 | ÓRBITA | 6 |
| 05 | ABISMO | 7 |
| 06 | ATÔMICA | 5 |
| **Total** |  | **34** |

## Penalidades a evitar

- `dica` reduz integridade e pontuação da task atual.
- Comandos desconhecidos geram penalidade.
- Derrubar processos legítimos causa dano colateral.
- Reiniciar o SSH antes de girar as chaves gera penalidade na Fase 04.
- Tasks compostas não concedem pontos enquanto houver requisitos pendentes.
