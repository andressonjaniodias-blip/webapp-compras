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
 * Limitacao aceita conscientemente: editar o MESMO registro nos dois aparelhos,
 * ambos offline, descarta a edicao mais antiga. Para um usuario so isso
 * praticamente nao acontece, e resolver de verdade (merge campo a campo ou
 * CRDT) custaria muito mais do que o problema vale aqui.
 *
 * As nove tabelas sao percorridas a partir de uma lista, e nao copiadas nove
 * vezes: com copia, a decima tabela seria esquecida em um dos laços e o sintoma
 * seria "os cartoes nao sobem", semanas depois.
 */

import { banco, gravarConfig, lerConfig } from './banco';
import { reconstruirCatalogo } from './catalogo';
import { chamarApi } from './api';
import type { EnvioSincronizacao, RespostaSincronizacao } from '../../compartilhado/tipos';

const CHAVE_CURSOR = 'cursorSincronizacao';
const CHAVE_ULTIMA = 'ultimaSincronizacaoEm';

/**
 * As tabelas sincronizadas, na ordem em que sobem.
 *
 * Contas primeiro: se a rodada cair no meio, e melhor existir a conta sem a
 * compra do que a compra apontando para uma conta que ninguem tem.
 */
const TABELAS = [
  'contas',
  'compras',
  'itens',
  'rendas',
  'dividas',
  'metas',
  'transferencias',
  'regras',
  'orcamentos',
] as const;

type NomeTabela = (typeof TABELAS)[number];

interface RegistroLocal {
  id: string;
  atualizadoEm: number;
  versao: number;
  pendente: 0 | 1;
}

function tabela(nome: NomeTabela) {
  return banco[nome] as unknown as {
    where: (indice: string) => { equals: (valor: number) => { count: () => Promise<number>; toArray: () => Promise<RegistroLocal[]> } };
    get: (id: string) => Promise<RegistroLocal | undefined>;
    put: (registro: RegistroLocal) => Promise<unknown>;
    toArray: () => Promise<RegistroLocal[]>;
    bulkPut: (registros: RegistroLocal[]) => Promise<unknown>;
  };
}

export interface ResultadoSincronizacao {
  enviados: number;
  recebidos: number;
  cursor: number;
}

/** Quantos registros estao esperando para subir. */
export async function contarPendentes(): Promise<number> {
  let total = 0;
  for (const nome of TABELAS) {
    total += await tabela(nome).where('pendente').equals(1).count();
  }
  return total;
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

/** Quantos registros de cada tabela sobem por rodada. Um POST gigante estoura o tempo limite. */
const TAMANHO_DO_LOTE = 500;

/**
 * Teto de rodadas por chamada. Cada uma sobe um lote e baixa uma pagina; 20
 * cobre 10 mil registros por tabela, bem acima de qualquer uso real, e impede
 * um laco infinito se o servidor responder sempre "ha mais".
 */
const MAXIMO_DE_RODADAS = 20;

interface RodadaFeita {
  enviados: number;
  recebidos: number;
  cursor: number;
  /** Sobrou coisa na fila local alem do lote desta rodada. */
  maisParaSubir: boolean;
  /** O servidor cortou a resposta no teto dele: ha mais para baixar. */
  maisParaBaixar: boolean;
}

/**
 * Sincroniza TUDO: repete rodadas ate subir a fila inteira e baixar tudo que ha.
 *
 * Antes era uma rodada so, e o servidor corta cada tabela em 2000 registros. Um
 * aparelho novo, ou uma restauracao com muitos itens, ficava "meio sincronizado"
 * ate a proxima abertura do app, sem aviso nenhum. O cursor so avanca ate onde
 * TODAS as tabelas estao completas (ver `calcularCursor`), entao repetir e seguro.
 */
export async function sincronizar(): Promise<ResultadoSincronizacao> {
  let enviados = 0;
  let recebidos = 0;
  let cursor = await lerConfig<number>(CHAVE_CURSOR, 0);

  for (let rodada = 0; rodada < MAXIMO_DE_RODADAS; rodada += 1) {
    const feita = await umaRodada(cursor);
    enviados += feita.enviados;
    recebidos += feita.recebidos;
    cursor = feita.cursor;
    if (!feita.maisParaSubir && !feita.maisParaBaixar) break;
  }

  await gravarConfig(CHAVE_ULTIMA, Date.now());

  // Itens vindos de outro aparelho tambem precisam entrar nas sugestoes deste.
  // Como o catalogo e derivado, refazer inteiro e mais confiavel que aplicar
  // delta — e e barato o bastante para nao valer a complexidade do incremental.
  if (recebidos > 0) await reconstruirCatalogo();

  return { enviados, recebidos, cursor };
}

async function umaRodada(cursor: number): Promise<RodadaFeita> {
  const lotes = {} as Record<NomeTabela, RegistroLocal[]>;
  let enviados = 0;
  let maisParaSubir = false;

  for (const nome of TABELAS) {
    const lista = await tabela(nome).where('pendente').equals(1).toArray();
    if (lista.length > TAMANHO_DO_LOTE) maisParaSubir = true;
    lotes[nome] = lista.slice(0, TAMANHO_DO_LOTE);
    enviados += lotes[nome].length;
  }

  const envio = {
    cursor,
    ...Object.fromEntries(TABELAS.map((nome) => [nome, lotes[nome].map(semCamposLocais)])),
  } as unknown as EnvioSincronizacao;

  const resposta = await chamarApi<RespostaSincronizacao>('/sync', {
    method: 'POST',
    body: JSON.stringify(envio),
  });

  const recebidos = await aplicarResposta(resposta);
  await soltarDescartados(resposta);
  await gravarConfig(CHAVE_CURSOR, resposta.cursor);

  return {
    enviados,
    recebidos,
    cursor: resposta.cursor,
    maisParaSubir,
    maisParaBaixar: resposta.maisParaBaixar === true,
  };
}

/**
 * Tira da fila o que o servidor recusou por invalido. Sem isto o registro ruim
 * ficava `pendente` e subia de novo a cada rodada, para sempre — o dado continua
 * guardado no aparelho, so deixa de travar a fila.
 */
async function soltarDescartados(resposta: RespostaSincronizacao): Promise<void> {
  for (const { tabela: nome, id } of resposta.descartados ?? []) {
    if (!(TABELAS as readonly string[]).includes(nome)) continue;
    const alvo = tabela(nome as NomeTabela);
    const local = await alvo.get(id);
    if (local && local.pendente === 1) await alvo.put({ ...local, pendente: 0 });
  }
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
  const bruta = resposta as unknown as Record<string, (RegistroLocal & { versao: number })[]>;

  for (const nome of TABELAS) {
    const remotos = bruta[nome] ?? [];
    if (remotos.length === 0) continue;

    const alvo = tabela(nome);
    await banco.transaction('rw', banco[nome], async () => {
      for (const remoto of remotos) {
        const local = await alvo.get(remoto.id);
        if (local && local.atualizadoEm > remoto.atualizadoEm) continue;
        await alvo.put({ ...remoto, pendente: 0 });
        aplicados += 1;
      }
    });
  }

  return aplicados;
}

/**
 * Marca tudo como pendente e reenvia.
 *
 * E o plano de recuperacao caso o banco na nuvem se perca: como o dado real
 * mora no aparelho, reconstruir a nuvem inteira vira tarefa de dois minutos em
 * vez de perda definitiva.
 */
export async function reenviarTudo(): Promise<ResultadoSincronizacao> {
  for (const nome of TABELAS) {
    const alvo = tabela(nome);
    const todos = await alvo.toArray();
    await alvo.bulkPut(todos.map((registro) => ({ ...registro, pendente: 1 as const })));
  }

  return sincronizar();
}
