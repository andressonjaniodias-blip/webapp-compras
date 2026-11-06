/**
 * Diz a quem nao ve a tela que a pagina mudou.
 *
 * O app e de uma pagina so (rota por hash), entao o navegador nao faz o que faz ao
 * abrir uma pagina nova: nao troca o titulo da aba e nao leva o foco para o comeco.
 * Quem usa leitor de tela tocava em "Metas" e ouvia silencio, sem saber se algo
 * aconteceu (WCAG 2.4.2, 4.1.3).
 *
 * A cada troca de ROTA (so o caminho, nao a busca: o mes na URL muda sem ser pagina
 * nova) o titulo do documento passa a ser o da pagina e o foco vai para o `h1`, que
 * o leitor de tela le. Na abertura do app nao mexe no foco: a pessoa acabou de chegar.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const TITULOS: Readonly<Record<string, string>> = {
  '': 'Compras',
  compras: 'Gastos',
  compra: 'Compra',
  receitas: 'Receitas',
  receita: 'Entrada',
  resumo: 'Resumo',
  ajustes: 'Ajustes',
  carteira: 'Carteira',
  simular: 'Posso comprar isto?',
  contas: 'Contas e cartões',
  dividas: 'Empréstimos',
  transferencias: 'Transferências',
  metas: 'Metas',
  orcamento: 'Orçamento',
  fatura: 'Fatura',
  parcela: 'Parcela',
};

/** "/fatura/abc/2026-09" -> "Fatura". Rota desconhecida cai no nome do app. */
export function tituloDaRota(caminho: string): string {
  const primeiro = caminho.split('/').filter(Boolean)[0] ?? '';
  return TITULOS[primeiro] ?? 'Compras';
}

export function AnunciaRota() {
  const { pathname } = useLocation();
  const primeira = useRef(true);

  useEffect(() => {
    const titulo = tituloDaRota(pathname);
    document.title = titulo === 'Compras' ? 'Compras' : `${titulo} · Compras`;

    if (primeira.current) {
      primeira.current = false;
      return;
    }

    // O `h1` so existe depois que a pagina carrega os dados: antes disso ela mostra
    // "Carregando…" sem cabecalho. Por isso a busca repete a cada 50 ms, por ate 2 s,
    // em vez de olhar uma vez so e desistir.
    let tentativas = 0;
    let quando = 0;
    const procurar = () => {
      const titulo1 = document.querySelector<HTMLElement>('h1');
      if (titulo1) {
        titulo1.tabIndex = -1;
        titulo1.focus({ preventScroll: true });
        return;
      }
      tentativas += 1;
      if (tentativas < 40) quando = window.setTimeout(procurar, 50);
    };
    quando = window.setTimeout(procurar, 0);
    return () => window.clearTimeout(quando);
  }, [pathname]);

  return null;
}
