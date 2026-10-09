/**
 * A porta do app: decide o que a tela inicial e.
 *
 * Com lado financeiro (conta ou entrada cadastrada, e fora do modo simples),
 * o painel. Sem ele, a lista de compras de sempre — e o que o Principio 0
 * garante a quem so quer anotar o que comprou. A escolha vem do DADO
 * (`financeiro.mostrar`), nao de uma preferencia que precisaria sincronizar.
 *
 * Enquanto o banco local carrega nao se desenha nenhum dos dois: escolher antes
 * faria o painel piscar vazio, ou a lista aparecer e trocar de lugar.
 */

import { useFinanceiro } from '../dados/financeiro';
import { ListaCompras } from './ListaCompras';
import { Painel } from './Painel';

export function Inicio() {
  const financeiro = useFinanceiro();

  if (financeiro.carregando) {
    return (
      <div className="app">
        <p className="carregando">Carregando…</p>
      </div>
    );
  }

  return financeiro.mostrar ? <Painel financeiro={financeiro} /> : <ListaCompras inicio />;
}
