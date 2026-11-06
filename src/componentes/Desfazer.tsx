/**
 * "Excluído · Desfazer", no lugar de perguntar antes.
 *
 * Excluir aqui e uma lapide (invariante 6), entao NADA se perde de verdade: perguntar
 * "tem certeza?" antes de cada exclusao era o contrario do que a regra permite —
 * custava um toque a mais para quem acertou e nao salvava quem errou, porque a
 * pessoa confirma sem ler. Avisar depois e deixar desfazer protege os dois.
 *
 * Uso:
 *   const oferecerDesfazer = useDesfazer();
 *   await removerItem(id);
 *   oferecerDesfazer('Item removido.', () => restaurarItem(id));
 *
 * O aviso some sozinho em 7 segundos, e um novo substitui o anterior (so cabe um).
 * `role="status"`: o leitor de tela o anuncia sem tirar o foco de onde esta.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const DURACAO_MS = 7000;

type Oferecer = (texto: string, desfazer: () => Promise<void> | void) => void;

const Contexto = createContext<Oferecer | null>(null);

export function useDesfazer(): Oferecer {
  const oferecer = useContext(Contexto);
  if (!oferecer) throw new Error('useDesfazer precisa estar dentro de ProvedorDeDesfazer.');
  return oferecer;
}

interface Aviso {
  texto: string;
  desfazer: () => Promise<void> | void;
}

export function ProvedorDeDesfazer({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const relogio = useRef<number | null>(null);

  const limpar = useCallback(() => {
    if (relogio.current !== null) window.clearTimeout(relogio.current);
    relogio.current = null;
    setAviso(null);
  }, []);

  const oferecer = useCallback<Oferecer>(
    (texto, desfazer) => {
      if (relogio.current !== null) window.clearTimeout(relogio.current);
      setAviso({ texto, desfazer });
      relogio.current = window.setTimeout(limpar, DURACAO_MS);
    },
    [limpar],
  );

  useEffect(() => () => {
    if (relogio.current !== null) window.clearTimeout(relogio.current);
  }, []);

  async function desfazer() {
    const atual = aviso;
    limpar();
    await atual?.desfazer();
  }

  return (
    <Contexto.Provider value={oferecer}>
      {children}
      <div className="desfazer" role="status" aria-live="polite">
        {aviso && (
          <>
            <span>{aviso.texto}</span>
            <button type="button" className="botao" onClick={() => void desfazer()}>
              Desfazer
            </button>
          </>
        )}
      </div>
    </Contexto.Provider>
  );
}
