/**
 * A frase que diz em que pe esta uma parcela de emprestimo.
 *
 * Mora aqui, e nao na tela, porque duas telas a usam (a lista de compras e a de
 * Emprestimos) e duas redacoes divergiriam. A SITUACAO em si e calculada em
 * `extratoDeDividas`; isto so a escreve.
 */

import type { ParcelaDeDivida } from '../../compartilhado/carteira';
import { formatarReais } from './dinheiro';
import { formatarDataCurta } from './datas';

export function textoDaParcela(parcela: ParcelaDeDivida): string {
  const dia = formatarDataCurta(parcela.quando);
  switch (parcela.situacao) {
    case 'descontada':
      return `descontada em ${dia}`;
    case 'a_descontar':
      return `desconta em ${dia}`;
    case 'paga':
      return `paga em ${dia}`;
    case 'parcial':
      return `pago ${formatarReais(parcela.pago)}, faltam ${formatarReais(parcela.restante)}`;
    case 'presumida':
      return 'considerada paga';
    case 'a_vencer':
      return `vence em ${dia}`;
    case 'em_aberto':
      return `venceu em ${dia} — registre o pagamento`;
  }
}
