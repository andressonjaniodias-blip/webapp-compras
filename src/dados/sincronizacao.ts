/**
 * A ponte entre o aparelho e a nuvem.
 *
 * Estrategia: last-write-wins por registro, com o numero de versao do servidor
 * como cursor.
 *
 * Por que o cursor e uma versao do servidor e nao um horario: se o relogio do
 * celular estiver adiantado, um cursor baseado na hora local pularia registros
 * em silencio. A sincronizacao pareceria funcionar e simplesmente deixaria
 * compras para tras — o pior tipo de bug, porque nao levanta erro nenhum. A
 * versao vem de uma sequence do Postgres: estritamente crescente e imune a
 * relogio errado.
 *
 * Limitacao aceita conscientemente: editar a MESMA compra nos dois aparelhos,
 * ambos offline, descarta a edicao mais antiga. Para um usuario so isso
 * praticamente nao acontece, e resolver de verdade (merge campo a campo ou
 * CRDT) custaria muito mais do que o problema vale aqui.
 */

import { banco, gravarConfig, lerConfig, type CompraLocal, type ItemLocal } from './banco';
import { reconstruirCatalogo } from './catalogo';
import { chamarApi } from './api';
import type {
  Compra,
  ComVersao,
  EnvioSincronizacao,
  Item,
  RespostaSincronizacao,
} from '../../compartilhado/tipos';

const CHAVE_CURSOR = 'cursorSincronizacao';
const CHAVE_ULTIMA = 'ultimaSincronizacaoEm';

export interface ResultadoSincronizacao {
  enviados: number;
  recebidos: number;
  cursor: number;
}

/** Quantos registros estao esperando para subir. */
export async function contarPendentes(): Promise<number> {
  const compras = await banco.compras.where('pendente').equals(1).count();
  const itens = await banco.itens.where('pendente').equals(1).count();
  return compras + itens;
}

export function ultimaSincronizacao(): Promise<number | null> {
  return lerConfig<number | null>(CHAVE_ULTIMA, null);
}

/** Tira os campos que so existem no aparelho antes de mandar pela rede. */
function semCamposLocais<T extends { versao: number; pendente: 0 | 1 }>(registro: T) {
  const { versao, pendente, ...resto } = registro;
  void versao;
  void pendente;
  return resto;
}

export async function sincronizar(): Promise<ResultadoSincronizacao> {
  const cursor = await lerConfig<number>(CHAVE_CURSOR, 0);

  const comprasPendentes = await banco.compras.where('pendente').equals(1).toArray();
  const itensPendentes = await banco.itens.where('pendente').equals(1).toArray();

  const envio: EnvioSincronizacao = {
    cursor,
    compras: comprasPendentes.map(semCamposLocais) as Compra[],
    itens: itensPendentes.map(semCamposLocais) as Item[],
  };

  const resposta = await chamarApi<RespostaSincronizacao>('/sync', {
    method: 'POST',
    body: JSON.stringify(envio),
  });

  const recebidos = await aplicarResposta(resposta);

  await gravarConfig(CHAVE_CURSOR, resposta.cursor);
  await gravarConfig(CHAVE_ULTIMA, Date.now());

  // Itens vindos de outro aparelho tambem precisam entrar nas sugestoes deste.
  // Como o catalogo e derivado, refazer inteiro e mais confiavel que aplicar
  // delta — e barato o bastante para nao valer a complexidade do incremental.
  if (recebidos > 0) await reconstruirCatalogo();

  return {
    enviados: comprasPendentes.length + itensPendentes.length,
    recebidos,
    cursor: resposta.cursor,
  };
}

/**
 * Aplica o que veio do servidor.
 *
 * A resposta inclui de volta o que este aparelho acabou de enviar — e assim que
 * ele descobre o numero de versao de cada registro, sem precisar de uma segunda
 * viagem. Quando o que volta e identico ao que temos, o efeito pratico e so
 * tirar o registro da fila.
 *
 * A regra de quem vence e a mesma dos dois lados: `atualizadoEm` maior manda.
 * Se o local for mais novo (voce editou enquanto a resposta vinha), o remoto e
 * ignorado e o registro segue pendente para subir na proxima rodada.
 */
async function aplicarResposta(resposta: RespostaSincronizacao): Promise<number> {
  let aplicados = 0;

  await banco.transaction('rw', banco.compras, banco.itens, async () => {
    for (const remoto of resposta.compras) {
      const local = await banco.compras.get(remoto.id);
      if (local && local.atualizadoEm > remoto.atualizadoEm) continue;
      await banco.compras.put(paraLocal<Compra, CompraLocal>(remoto));
      aplicados += 1;
    }

    for (const remoto of resposta.itens) {
      const local = await banco.itens.get(remoto.id);
      if (local && local.atualizadoEm > remoto.atualizadoEm) continue;
      await banco.itens.put(paraLocal<Item, ItemLocal>(remoto));
      aplicados += 1;
    }
  });

  return aplicados;
}

function paraLocal<T extends object, L>(remoto: ComVersao<T>): L {
  const { versao, ...dados } = remoto;
  return { ...dados, versao, pendente: 0 } as L;
}

/**
 * Marca tudo como pendente e reenvia.
 *
 * E o plano de recuperacao caso o banco na nuvem se perca: como o dado real
 * mora no aparelho, reconstruir a nuvem inteira vira tarefa de dois minutos em
 * vez de perda definitiva.
 */
export async function reenviarTudo(): Promise<ResultadoSincronizacao> {
  await banco.transaction('rw', banco.compras, banco.itens, async () => {
    const compras = await banco.compras.toArray();
    const itens = await banco.itens.toArray();
    await banco.compras.bulkPut(compras.map((c) => ({ ...c, pendente: 1 as const })));
    await banco.itens.bulkPut(itens.map((i) => ({ ...i, pendente: 1 as const })));
  });

  return sincronizar();
}
