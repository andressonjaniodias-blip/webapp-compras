/**
 * A porta do backup: ler tudo do aparelho e devolver tudo a ele.
 *
 * Existe porque `src/lib/exportar.ts` lia e escrevia o Dexie direto, e a regra do
 * projeto e que so `src/dados/` fala com o banco (invariante 5). A decisao de QUEM
 * VENCE na restauracao esta em `compartilhado/backup.ts`, onde da para testar.
 *
 * Diferente de `compras.ts` e `financas.ts`, restaurar NAO usa `carimbo()`: o
 * registro volta com o `atualizadoEm` que tinha no arquivo (e esse valor que decide
 * quem vence), so marcado `pendente` para a nuvem tambem receber.
 */

import {
  banco,
  type CompraLocal,
  type ContaLocal,
  type DividaLocal,
  type ItemLocal,
  type MetaLocal,
  type OrcamentoLocal,
  type RegraLocal,
  type RendaLocal,
  type TransferenciaLocal,
} from './banco';
import { filtrarBackupMaisNovo } from '../../compartilhado/backup';
import { naoExcluido } from '../../compartilhado/tipos';

/** O conteudo de um backup: tudo, inclusive o que esta na lapide. */
export interface DadosDoBackup {
  compras: CompraLocal[];
  itens: ItemLocal[];
  contas?: ContaLocal[];
  rendas?: RendaLocal[];
  dividas?: DividaLocal[];
  metas?: MetaLocal[];
  transferencias?: TransferenciaLocal[];
  regras?: RegraLocal[];
  orcamentos?: OrcamentoLocal[];
}

/** Tudo que esta vivo (sem lapide), para as planilhas. */
export interface TudoVivo {
  compras: CompraLocal[];
  itens: ItemLocal[];
  contas: ContaLocal[];
  rendas: RendaLocal[];
  dividas: DividaLocal[];
  metas: MetaLocal[];
  transferencias: TransferenciaLocal[];
  regras: RegraLocal[];
}

/**
 * Tudo que esta vivo. Item cuja compra esta na lapide tambem fica de fora: o
 * servidor ja faz isso, e sem aqui a planilha mostraria itens de compras excluidas
 * (invariante 6).
 */
export async function lerTudoVivo(): Promise<TudoVivo> {
  const compras = (await banco.compras.toArray()).filter(naoExcluido);
  compras.sort((a, b) => a.data - b.data);
  const vivas = new Set(compras.map((c) => c.id));

  return {
    compras,
    itens: (await banco.itens.toArray()).filter((i) => naoExcluido(i) && vivas.has(i.compraId)),
    contas: (await banco.contas.toArray()).filter(naoExcluido),
    rendas: (await banco.rendas.toArray()).filter(naoExcluido),
    dividas: (await banco.dividas.toArray()).filter(naoExcluido),
    metas: (await banco.metas.toArray()).filter(naoExcluido),
    transferencias: (await banco.transferencias.toArray()).filter(naoExcluido),
    regras: (await banco.regras.toArray()).filter(naoExcluido),
  };
}

/**
 * Tudo, COM as lapides. Elas vao de proposito: restaurar um backup sem elas
 * ressuscitaria toda compra ja excluida, e na sincronizacao seguinte elas voltariam
 * para os outros aparelhos tambem.
 */
export async function lerTudoParaBackup(): Promise<DadosDoBackup> {
  return {
    compras: await banco.compras.toArray(),
    itens: await banco.itens.toArray(),
    contas: await banco.contas.toArray(),
    rendas: await banco.rendas.toArray(),
    dividas: await banco.dividas.toArray(),
    metas: await banco.metas.toArray(),
    transferencias: await banco.transferencias.toArray(),
    regras: await banco.regras.toArray(),
    orcamentos: await banco.orcamentos.toArray(),
  };
}

/**
 * Devolve o backup ao aparelho. So entra o que NAO e mais velho que o que ja esta
 * aqui (ver `filtrarBackupMaisNovo`), e tudo que entra volta `pendente` para a
 * proxima sincronizacao reenviar — senao o aparelho ficaria com dado que a nuvem
 * nunca viu. Devolve quantas compras e itens do arquivo ENTRARAM.
 */
export async function restaurarBackup(
  dados: DadosDoBackup,
): Promise<{ compras: number; itens: number }> {
  const tabelas = [
    banco.compras, banco.itens, banco.contas, banco.rendas, banco.dividas, banco.metas,
    banco.transferencias, banco.regras, banco.orcamentos,
  ];
  let entraram = { compras: 0, itens: 0 };

  await banco.transaction('rw', tabelas, async () => {
    const pendente = <T extends { id: string; atualizadoEm: number }>(
      lista: T[] | undefined,
      atuais: { id: string; atualizadoEm: number }[],
    ) => filtrarBackupMaisNovo(lista ?? [], atuais).map((r) => ({ ...r, pendente: 1 as const }));

    const compras = pendente(dados.compras, await banco.compras.toArray());
    const itens = pendente(dados.itens, await banco.itens.toArray());
    entraram = { compras: compras.length, itens: itens.length };

    await banco.compras.bulkPut(compras);
    await banco.itens.bulkPut(itens);
    await banco.contas.bulkPut(pendente(dados.contas, await banco.contas.toArray()));
    await banco.rendas.bulkPut(pendente(dados.rendas, await banco.rendas.toArray()));
    await banco.dividas.bulkPut(pendente(dados.dividas, await banco.dividas.toArray()));
    await banco.metas.bulkPut(pendente(dados.metas, await banco.metas.toArray()));
    await banco.transferencias.bulkPut(
      pendente(dados.transferencias, await banco.transferencias.toArray()),
    );
    await banco.regras.bulkPut(pendente(dados.regras, await banco.regras.toArray()));
    await banco.orcamentos.bulkPut(pendente(dados.orcamentos, await banco.orcamentos.toArray()));
  });

  return entraram;
}
