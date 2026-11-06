/**
 * Uma janela no centro da tela, sobre a pagina.
 *
 * Existe porque o formulario de item vivia em linha dentro da compra: o de
 * inserir ficava no fim da lista e o de editar abria no meio dela, e numa compra
 * de supermercado com quarenta itens ele nascia fora da area visivel. Aqui ele
 * abre sempre no meio da tela, onde quer que a lista esteja rolada.
 *
 * E o `<dialog>` nativo com `showModal()`, sem biblioteca: ele ja traz a camada
 * superior, o foco preso, o fundo inerte e o Esc fechando — o que uma `div`
 * posicionada teria de reimplementar, e errar no teclado do celular.
 *
 * Nao renderiza nada fechada: o formulario de dentro nao fica montado, com o
 * estado e os `id` dele, por baixo da pagina.
 */

import { useEffect, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';

interface Props {
  aberta: boolean;
  onFechar: () => void;
  titulo?: string;
  children: ReactNode;
}

export function JanelaCentral({ aberta, onFechar, titulo, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!aberta || !dialogo) return;
    // Quem tinha o foco antes de abrir (o botao "Adicionar item", ou a linha do
    // item editado). Ao fechar o foco volta para la: sem isso, quem usa teclado
    // ou leitor de tela cai no topo da pagina e perde onde estava (WCAG 2.4.3).
    const origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogo.showModal();
    // O foco fica na propria janela, e nao no primeiro campo: o `showModal()`
    // focaria o nome do item, e o foco ali abre a lista de sugestoes por cima dos
    // outros campos antes de a pessoa tocar em nada.
    dialogo.focus();
    return () => {
      if (dialogo.open) dialogo.close();
      if (origem?.isConnected) origem.focus();
    };
  }, [aberta]);

  if (!aberta) return null;

  // O clique no fundo tem como alvo o proprio `<dialog>`. O espaçamento fica no
  // corpo, de proposito: tocar na borda de dentro nao pode fechar a janela.
  function aoTocar(evento: MouseEvent<HTMLDialogElement>) {
    if (evento.target === evento.currentTarget) onFechar();
  }

  // O Esc: quem fecha e o estado de quem a abriu, e nao o navegador por baixo.
  // Assim a janela some pelo mesmo caminho de "Fechar" e do toque no fundo, e o
  // estado nunca fica "aberta" com a janela ja fechada.
  function aoCancelar(evento: SyntheticEvent<HTMLDialogElement>) {
    evento.preventDefault();
    onFechar();
  }

  // O `close` tambem dispara quando o efeito acima fecha por codigo (e, em
  // desenvolvimento, na dupla montagem do StrictMode, ja com a janela reaberta).
  // So vale quando ela de fato esta fechada.
  function aoFechar() {
    if (!ref.current?.open) onFechar();
  }

  return (
    <dialog
      ref={ref}
      className="janela"
      tabIndex={-1}
      aria-label={titulo}
      onCancel={aoCancelar}
      onClose={aoFechar}
      onClick={aoTocar}
    >
      <div className="janela-corpo">
        {titulo && <h2 className="janela-titulo">{titulo}</h2>}
        {children}
      </div>
    </dialog>
  );
}
