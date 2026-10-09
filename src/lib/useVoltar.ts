/**
 * O "‹" das telas: devolve a pessoa para ONDE ela estava.
 *
 * Uma pagina como Metas e alcancavel por mais de um caminho (o painel da tela
 * inicial, a Carteira). Com o destino fixo em `/carteira`, quem vinha do painel
 * caia numa tela que nao tinha aberto. Havendo historico, volta um passo; sem
 * ele — a pagina foi recarregada ou aberta por atalho — vai para o destino
 * padrao, que e o lugar onde a pagina mora.
 */

import { useLocation, useNavigate } from 'react-router-dom';

export function useVoltar(padrao: string): () => void {
  const navegar = useNavigate();
  const local = useLocation();

  return () => {
    if (local.key === 'default') navegar(padrao);
    else navegar(-1);
  };
}
