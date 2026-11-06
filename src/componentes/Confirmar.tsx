/**
 * A pergunta "tem certeza?", numa janela do app em vez do `window.confirm`.
 *
 * O `window.confirm` e bloqueante, nao se estiliza, vem com o titulo do endereco do
 * site, e em PWA instalado fica deslocado. Aqui a pergunta usa a mesma
 * `JanelaCentral` (o `<dialog>` nativo) das outras janelas: foco preso, Esc que
 * cancela, foco devolvido ao botao que a abriu.
 *
 * Uso:
 *   const confirmar = useConfirmar();
 *   if (!(await confirmar({ texto: 'Excluir esta meta?', rotulo: 'Excluir' }))) return;
 *
 * Esc, "Cancelar" e o toque no fundo respondem `false`. So o botao de confirmar
 * responde `true`. Para o que e so uma exclusao com lapide (reversivel), prefira
 * `useDesfazer`: perguntar antes e pior do que deixar desfazer depois.
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { JanelaCentral } from './JanelaCentral';

export interface PedidoDeConfirmacao {
  /** O que vai acontecer, em uma ou duas frases. */
  texto: string;
  titulo?: string;
  /** O verbo do botao: "Excluir", "Gerar de novo". Nunca "OK". */
  rotulo?: string;
  /** Pinta o botao de perigo (exclusao). */
  perigo?: boolean;
}

type Confirmar = (pedido: PedidoDeConfirmacao) => Promise<boolean>;

const Contexto = createContext<Confirmar | null>(null);

export function useConfirmar(): Confirmar {
  const confirmar = useContext(Contexto);
  if (!confirmar) throw new Error('useConfirmar precisa estar dentro de ProvedorDeConfirmacao.');
  return confirmar;
}

export function ProvedorDeConfirmacao({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<PedidoDeConfirmacao | null>(null);
  const resolver = useRef<((resposta: boolean) => void) | null>(null);

  const confirmar = useCallback<Confirmar>((novo) => {
    // Uma pergunta nova com outra ainda aberta cancela a anterior.
    resolver.current?.(false);
    return new Promise<boolean>((resolvido) => {
      resolver.current = resolvido;
      setPedido(novo);
    });
  }, []);

  function responder(resposta: boolean) {
    resolver.current?.(resposta);
    resolver.current = null;
    setPedido(null);
  }

  return (
    <Contexto.Provider value={confirmar}>
      {children}
      <JanelaCentral
        aberta={pedido !== null}
        onFechar={() => responder(false)}
        titulo={pedido?.titulo ?? 'Confirmar'}
      >
        <p className="confirmar-texto">{pedido?.texto}</p>
        <div className="form-item-rodape">
          <button type="button" className="botao" onClick={() => responder(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className={'botao ' + (pedido?.perigo ? 'botao-perigo' : 'botao-primario')}
            onClick={() => responder(true)}
          >
            {pedido?.rotulo ?? 'Confirmar'}
          </button>
        </div>
      </JanelaCentral>
    </Contexto.Provider>
  );
}
