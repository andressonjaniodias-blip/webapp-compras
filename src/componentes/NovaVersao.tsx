/**
 * "Nova versão disponível · Atualizar".
 *
 * Fica na tela ate a pessoa tocar: nao some sozinho como o "Desfazer", porque perder
 * o aviso de uma atualizacao nao e menos grave que ignora-lo, e atualizar recarrega a
 * pagina — o que ela so vai querer fazer quando nao estiver no meio de uma compra.
 * Usa a mesma faixa do `Desfazer` (`.desfazer`), com `role="status"` para o leitor de
 * tela anunciar sem tirar o foco de onde esta.
 */

import { useEffect, useState } from 'react';
import { aplicarNovaVersao, EVENTO_NOVA_VERSAO, jaHaVersaoNova } from '../lib/versao';

export function NovaVersao() {
  const [disponivel, setDisponivel] = useState(jaHaVersaoNova);

  useEffect(() => {
    const aoAvisar = () => setDisponivel(true);
    window.addEventListener(EVENTO_NOVA_VERSAO, aoAvisar);
    return () => window.removeEventListener(EVENTO_NOVA_VERSAO, aoAvisar);
  }, []);

  return (
    <div className="desfazer desfazer-alto" role="status" aria-live="polite">
      {disponivel && (
        <>
          <span>Nova versão disponível.</span>
          <button type="button" className="botao botao-primario" onClick={aplicarNovaVersao}>
            Atualizar
          </button>
        </>
      )}
    </div>
  );
}
