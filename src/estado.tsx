/**
 * Sessao e sincronizacao, compartilhadas por todas as telas.
 *
 * A decisao que molda este arquivo: **falha de rede nao tranca o app**.
 *
 * A tela de senha aparece so quando o servidor responde dizendo, explicitamente,
 * que voce nao esta autenticado. Se ele estiver dormindo, caido ou inalcançavel,
 * o app abre normalmente e trabalha no banco local. Tem que ser assim: o dado
 * mora no aparelho, e o corredor do mercado e exatamente onde o sinal falha.
 * Bloquear ali tornaria o app inutil justamente na hora em que ele serve.
 *
 * Isso nao afrouxa a seguranca. A senha protege o que esta na nuvem e a chave
 * da IA, e ambas continuam atras do servidor: sem sessao valida, `/api/sync` e
 * `/api/dicas` respondem 401 e nada sobe nem desce.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { FalhaDeRede, SemSessao, entrar, sair, verificarSessao } from './dados/api';
import { contarPendentes, sincronizar, ultimaSincronizacao } from './dados/sincronizacao';

export type Acesso = 'verificando' | 'liberado' | 'bloqueado';
export type Situacao = 'ocioso' | 'sincronizando' | 'erro';

interface Estado {
  acesso: Acesso;
  /** O servidor esta inalcançavel: trabalhando so no aparelho. */
  offline: boolean;
  iaLigada: boolean;
  situacao: Situacao;
  pendentes: number;
  ultimaEm: number | null;
  mensagem: string | null;
  sincronizarAgora: (forcar?: boolean) => Promise<void>;
  autenticar: (senha: string) => Promise<void>;
  encerrarSessao: () => Promise<void>;
  atualizarPendentes: () => Promise<void>;
}

const Contexto = createContext<Estado | null>(null);

export function useApp(): Estado {
  const estado = useContext(Contexto);
  if (!estado) throw new Error('useApp precisa estar dentro de ProvedorApp.');
  return estado;
}

export function ProvedorApp({ children }: { children: ReactNode }) {
  const [acesso, setAcesso] = useState<Acesso>('verificando');
  const [offline, setOffline] = useState(false);
  const [iaLigada, setIaLigada] = useState(false);
  const [situacao, setSituacao] = useState<Situacao>('ocioso');
  const [pendentes, setPendentes] = useState(0);
  const [ultimaEm, setUltimaEm] = useState<number | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const atualizarPendentes = useCallback(async () => {
    setPendentes(await contarPendentes());
    setUltimaEm(await ultimaSincronizacao());
  }, []);

  const sincronizarAgora = useCallback(
    async (forcar = false) => {
      if (situacao === 'sincronizando') return;
      setSituacao('sincronizando');
      setMensagem(null);

      try {
        const resultado = await sincronizar();
        setSituacao('ocioso');
        setOffline(false);
        if (forcar) {
          setMensagem(
            `Enviados ${resultado.enviados}, recebidos ${resultado.recebidos}.`,
          );
        }
      } catch (falha) {
        if (falha instanceof SemSessao) {
          setAcesso('bloqueado');
          setSituacao('ocioso');
          return;
        }
        setSituacao('erro');
        if (falha instanceof FalhaDeRede) setOffline(true);
        setMensagem(falha instanceof Error ? falha.message : 'Falha ao sincronizar.');
      } finally {
        await atualizarPendentes();
      }
    },
    [situacao, atualizarPendentes],
  );

  // Na abertura: descobre se ha sessao e, havendo, ja sincroniza.
  useEffect(() => {
    let vivo = true;

    (async () => {
      await atualizarPendentes();
      try {
        const estado = await verificarSessao();
        if (!vivo) return;
        setIaLigada(estado.iaLigada);
        setAcesso(estado.autenticado ? 'liberado' : 'bloqueado');
        if (estado.autenticado) void sincronizarAgora();
      } catch (falha) {
        if (!vivo) return;
        if (falha instanceof SemSessao) {
          setAcesso('bloqueado');
          return;
        }
        // Servidor fora do ar: segue no banco local. Ver o topo do arquivo.
        setOffline(true);
        setAcesso('liberado');
      }
    })();

    return () => {
      vivo = false;
    };
    // Roda uma vez na montagem; `sincronizarAgora` muda de identidade a cada
    // troca de situacao e re-executar isso reiniciaria a verificacao a toa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Voltou a ter internet ou o app voltou para a frente: tenta subir a fila.
  useEffect(() => {
    function tentar() {
      if (acesso === 'liberado' && document.visibilityState === 'visible') {
        void sincronizarAgora();
      }
    }
    window.addEventListener('online', tentar);
    document.addEventListener('visibilitychange', tentar);
    return () => {
      window.removeEventListener('online', tentar);
      document.removeEventListener('visibilitychange', tentar);
    };
  }, [acesso, sincronizarAgora]);

  const autenticar = useCallback(
    async (senha: string) => {
      const estado = await entrar(senha);
      setIaLigada(estado.iaLigada);
      setAcesso('liberado');
      setOffline(false);
      void sincronizarAgora();
    },
    [sincronizarAgora],
  );

  const encerrarSessao = useCallback(async () => {
    await sair();
    setAcesso('bloqueado');
  }, []);

  const valor = useMemo<Estado>(
    () => ({
      acesso, offline, iaLigada, situacao, pendentes, ultimaEm, mensagem,
      sincronizarAgora, autenticar, encerrarSessao, atualizarPendentes,
    }),
    [acesso, offline, iaLigada, situacao, pendentes, ultimaEm, mensagem,
     sincronizarAgora, autenticar, encerrarSessao, atualizarPendentes],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
