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

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listarCompras } from './compras';
import {
  lerEntradaManual,
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
  /** Entrada mensal digitada pelo usuario, em centavos. `null` = usar a media. */
  entradaManual: number | null;
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
  entradaManual: null,
  modoSimples: false,
  carregando: true,
  temContas: false,
  temRenda: false,
  temMetas: false,
  temDividas: false,
  mostrar: false,
};

/**
 * Uma consulta por tabela, e nao uma so lendo tudo.
 *
 * Com uma consulta unica, QUALQUER escrita (um item novo, uma preferencia) relia
 * as seis tabelas e as duas configuracoes, e todo consumidor recalculava em cima de
 * dados que nao mudaram. Agora cada tabela se atualiza sozinha, e `dados` so troca de
 * identidade quando alguma das seis muda de fato — a tela que memoriza em cima dele
 * deixa de recalcular por causa de uma preferencia.
 */
export function useFinanceiro(): EstadoFinanceiro {
  const contas = useLiveQuery(listarContas, []);
  const compras = useLiveQuery(listarCompras, []);
  const rendas = useLiveQuery(listarRendas, []);
  const dividas = useLiveQuery(listarDividas, []);
  const metas = useLiveQuery(listarMetas, []);
  const transferencias = useLiveQuery(listarTransferencias, []);
  // `null` e um valor valido (sem numero digitado); `undefined` e "ainda lendo".
  const modoSimples = useLiveQuery(lerModoSimples, []);
  const gastoManual = useLiveQuery(lerGastoManual, []);
  const entradaManual = useLiveQuery(lerEntradaManual, []);

  const dados = useMemo<DadosFinanceiros | null>(
    () =>
      contas && compras && rendas && dividas && metas && transferencias
        ? { contas, compras, rendas, dividas, metas, transferencias }
        : null,
    [contas, compras, rendas, dividas, metas, transferencias],
  );

  return useMemo<EstadoFinanceiro>(() => {
    if (
      !dados ||
      modoSimples === undefined ||
      gastoManual === undefined ||
      entradaManual === undefined
    ) {
      return VAZIO;
    }

    const temContas = dados.contas.length > 0;
    const temRenda = dados.rendas.length > 0;

    return {
      dados,
      gastoManual,
      entradaManual,
      modoSimples,
      carregando: false,
      temContas,
      temRenda,
      temMetas: dados.metas.length > 0,
      temDividas: dados.dividas.length > 0,
      mostrar: !modoSimples && (temContas || temRenda),
    };
  }, [dados, modoSimples, gastoManual, entradaManual]);
}
