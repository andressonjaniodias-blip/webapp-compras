/**
 * O carregamento do lado financeiro, num lugar so.
 *
 * Existe para que o **Princípio 0** seja verificavel em vez de ser boa vontade:
 * quem nunca cadastrou conta, renda ou meta recebe `mostrar: false` e as telas
 * nem chegam a desenhar nada novo. A visibilidade e derivada do DADO, e nao de
 * uma preferencia que precisaria ser sincronizada e mantida em dia — a unica
 * preferencia envolvida e o modo simples, que e gosto de aparelho.
 *
 * Todas as leituras passam pelo `useLiveQuery`, entao qualquer escrita feita
 * pelas portas (`compras.ts` e `financas.ts`) atualiza a tela sozinha.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { listarCompras } from './compras';
import {
  lerGastoManual,
  lerModoSimples,
  listarContas,
  listarDividas,
  listarMetas,
  listarRendas,
  listarTransferencias,
} from './financas';
import { SEM_DADOS, type DadosFinanceiros } from '../../compartilhado/carteira';

export interface EstadoFinanceiro {
  dados: DadosFinanceiros;
  /** Gasto corrente digitado pelo usuario, em centavos. `null` = usar a media. */
  gastoManual: number | null;
  modoSimples: boolean;
  carregando: boolean;
  temContas: boolean;
  temRenda: boolean;
  temMetas: boolean;
  temDividas: boolean;
  /**
   * Desenhar qualquer coisa do lado financeiro?
   *
   * Falso enquanto nao ha conta nem renda — e ai a tela inicial fica byte a byte
   * como era antes desta versao, que e o compromisso do Princípio 0.
   */
  mostrar: boolean;
}

const VAZIO: EstadoFinanceiro = {
  dados: SEM_DADOS,
  gastoManual: null,
  modoSimples: false,
  carregando: true,
  temContas: false,
  temRenda: false,
  temMetas: false,
  temDividas: false,
  mostrar: false,
};

export function useFinanceiro(): EstadoFinanceiro {
  const estado = useLiveQuery(async (): Promise<EstadoFinanceiro> => {
    const [contas, compras, rendas, dividas, metas, transferencias, modoSimples, gastoManual] =
      await Promise.all([
        listarContas(),
        listarCompras(),
        listarRendas(),
        listarDividas(),
        listarMetas(),
        listarTransferencias(),
        lerModoSimples(),
        lerGastoManual(),
      ]);

    const dados: DadosFinanceiros = { contas, compras, rendas, dividas, metas, transferencias };
    const temContas = contas.length > 0;
    const temRenda = rendas.length > 0;

    return {
      dados,
      gastoManual,
      modoSimples,
      carregando: false,
      temContas,
      temRenda,
      temMetas: metas.length > 0,
      temDividas: dividas.length > 0,
      mostrar: !modoSimples && (temContas || temRenda),
    };
  }, []);

  return estado ?? VAZIO;
}
