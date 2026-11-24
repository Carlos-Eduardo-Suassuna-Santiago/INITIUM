import { useState } from "react";
import { motion } from "framer-motion";
import { Mark, Silk } from "./Rack";

const plate = "absolute inset-0 z-30 flex flex-col overflow-y-auto overscroll-contain no-scrollbar";
const wrap = "m-auto flex w-full max-w-[1240px] min-w-0 flex-col px-4 py-6 sm:px-8";

function hashSenha(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

const AUTH_KEY = "initium.auth.v1";

type Credenciais = { usuario: string; senha: string };

function carregarCredenciais(): Credenciais | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw) as Credenciais;
  } catch {}
  return null;
}

function salvarCredenciais(u: string, s: string) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ usuario: u, senha: hashSenha(s) }));
  } catch {}
}

export function LoginScreen({
  onLogin,
}: {
  onLogin: (operatorName: string) => void;
}) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [cadastrando, setCadastrando] = useState(false);

  const credenciais = carregarCredenciais();
  const temCadastro = !!credenciais;

  const handleEntrar = () => {
    const u = usuario.trim();
    const s = senha.trim();
    if (!u || !s) {
      setErro("Informe usuário e senha.");
      return;
    }
    if (!temCadastro) {
      setErro("Nenhuma conta cadastrada. Crie uma primeiro.");
      return;
    }
    if (credenciais!.usuario === u && credenciais!.senha === hashSenha(s)) {
      setErro(null);
      onLogin(u);
    } else {
      setErro("Usuário ou senha incorretos.");
    }
  };

  const handleCadastrar = () => {
    const u = usuario.trim();
    const s = senha.trim();
    if (!u || !s) {
      setErro("Informe usuário e senha.");
      return;
    }
    if (u.length < 3) {
      setErro("O usuário deve ter pelo menos 3 caracteres.");
      return;
    }
    if (s.length < 4) {
      setErro("A senha deve ter pelo menos 4 caracteres.");
      return;
    }
    salvarCredenciais(u, s);
    setCadastrando(false);
    setErro(null);
    onLogin(u);
  };

  return (
    <div className={`${plate} items-center bg-chassis/97 backdrop-blur-[2px]`}>
      <div className={`${wrap} items-center`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Mark className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <Silk>autorização de acesso ao laboratório</Silk>
          </div>
          <div className="hairline hidden min-w-[32px] flex-1 sm:block" />
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 14, scaleY: 0.86 }}
          animate={{ opacity: 1, y: 0, scaleY: 1 }}
          transition={{ duration: 0.5, ease: [0.2, 0.9, 0.2, 1] }}
          className="disp mt-5 w-full text-center text-[clamp(44px,15vw,140px)] break-words text-phos glow"
        >
          LOGIN
        </motion.h1>

        <div className="mt-6 w-full min-w-0 max-w-[420px]">
          {erro && (
            <div className="mb-4 border border-alarm/60 bg-alarm/10 px-3 py-2 text-center text-[11px] font-bold break-words text-alarm">
              {erro}
            </div>
          )}

          {!cadastrando ? (
            <>
              <div className="space-y-3">
                <div>
                  <Silk>nome de usuário</Silk>
                  <input
                    autoComplete="username"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    placeholder="operador"
                    aria-label="nome de usuário"
                    className="module w-full px-3 py-3 text-center text-[16px] tracking-[0.2em] text-phos placeholder:text-slate2/60 outline-none"
                  />
                </div>
                <div>
                  <Silk>senha de acesso</Silk>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="••••••"
                    aria-label="senha de acesso"
                    className="module w-full px-3 py-3 text-center text-[16px] tracking-[0.2em] text-phos placeholder:text-slate2/60 outline-none"
                  />
                </div>
              </div>

              <button
                onClick={handleEntrar}
                className="btn-slab w-full min-w-0 overflow-hidden border-2 border-phos bg-phos/20 px-4 py-5 text-left text-phos hover:bg-phos/30 shadow-[0_0_20px_rgba(57,255,136,0.2)] mt-6 sm:px-6"
              >
                <span className="disp block text-[clamp(17px,4.5vw,26px)] leading-tight break-words">
                  ENTRAR NO LABORATÓRIO
                </span>
                <span className="silk mt-1 block">enter</span>
              </button>

              <button
                onClick={() => setCadastrando(true)}
                className="btn-slab mt-3 w-full min-w-0 overflow-hidden border border-hair bg-panel2 px-4 py-3.5 text-left text-slate hover:border-phos/50 hover:text-phos-lt sm:px-5"
              >
                <span className="disp block text-[15px] leading-tight break-words sm:text-[16px]">
                  CADASTRAR OPERADOR
                </span>
                <span className="silk mt-0.5 block">crie ou atualize usuário e senha</span>
              </button>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div>
                  <Silk>novo nome de usuário</Silk>
                  <input
                    autoComplete="username"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    placeholder="operador"
                    aria-label="novo nome de usuário"
                    className="module w-full px-3 py-3 text-center text-[16px] tracking-[0.2em] text-phos placeholder:text-slate2/60 outline-none"
                  />
                </div>
                <div>
                  <Silk>definir senha de acesso</Silk>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="••••••"
                    aria-label="definir senha de acesso"
                    className="module w-full px-3 py-3 text-center text-[16px] tracking-[0.2em] text-phos placeholder:text-slate2/60 outline-none"
                  />
                </div>
              </div>

              <button
                onClick={handleCadastrar}
                className="btn-slab w-full min-w-0 overflow-hidden border-2 border-phos bg-phos/20 px-4 py-5 text-left text-phos hover:bg-phos/30 shadow-[0_0_20px_rgba(57,255,136,0.2)] mt-6 sm:px-6"
              >
                <span className="disp block text-[clamp(17px,4.5vw,26px)] leading-tight break-words">
                  CONFIRMAR CADASTRO
                </span>
                <span className="silk mt-1 block">entrar no laboratório</span>
              </button>

              <button
                onClick={() => setCadastrando(false)}
                className="btn-slab w-full min-w-0 overflow-hidden border border-hair bg-panel2 px-4 py-3.5 text-left text-slate hover:border-phos/50 hover:text-phos-lt mt-3 sm:px-5"
              >
                <span className="disp block text-[15px] leading-tight break-words sm:text-[16px]">
                  VOLTAR AO LOGIN
                </span>
              </button>
            </>
          )}

          <div className="mt-6 border-t border-hair pt-3 text-center text-[10px] text-slate2 break-words">
            INITIUM — acesso restrito a personnel autorizado do CSIRT Nacional
          </div>
        </div>
      </div>
    </div>
  );
}
