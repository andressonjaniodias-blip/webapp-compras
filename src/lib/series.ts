/**
 * As series que os graficos desenham. Funcoes puras, sem banco e sem tela:
 * recebem o que ja foi carregado e devolvem numeros.
 *
 * POR QUE ESTE ARQUIVO EXISTE. Um grafico que faz a propria conta e o jeito mais
 * rapido de criar o quinto numero chamado "sobra" (ver o topo de
 * `compartilhado/carteira.ts`). Entao os componentes de `componentes/graficos/`
 * so DESENHAM, e tudo que eles mostram sai daqui — e daqui sai das mesmas
 * funcoes que as paginas ja usam (`gastoPorGrupo`, `estimarGastoCorrente`). Como
 * sao puras, `npm run teste:contas` confere cada uma sem navegador.
 *
 * Nada aqui fala com o Dexie (invariante 5): os itens chegam por parametro.
 */

import { gastoPorGrupo } from '../../compartilhado/carteira';
import { grupoDaCategoria } from '../../compartilhado/constantes';
import { diasNoMes, partesDaChave, somarMeses } from '../../compartilhado/fatura';
import type { Estimativa } from '../../compartilhado/previsao';
import { naoExcluido, normalizarNome, type Compra, type Item } from '../../compartilhado/tipos';
import { chaveMes, intervaloDoMes, mesAnterior } from './datas';

export type EstadoDaBarra = 'cabe' | 'aperta' | 'estoura';

/**
 * O estado de um saldo previsto: abaixo de zero estoura, abaixo da folga
 * (`folgaDe`, metade do gasto tipico) aperta, e do resto cabe. E a regra do
 * veredito do simulador, que o grafico do saldo desenha ponto a ponto.
 */
export function estadoDoSaldo(saldo: number, folga: number): EstadoDaBarra {
  if (saldo < 0) return 'estoura';
  if (saldo < folga) return 'aperta';
  return 'cabe';
}

/** O ultimo instante de um dia, para o dia contar inteiro. `mes` e 0-based. */
function fimDoDia(ano: number, mes: number, dia: number): number {
  return new Date(ano, mes, dia, 23, 59, 59, 999).getTime();
}

// ------------------------------------------------------- o mes em 31 marcas

/**
 * O gasto VARIAVEL de cada dia do mes, em centavos: uma posicao por dia, do dia 1
 * ao ultimo.
 *
 * So o variavel, porque e o que o dia a dia controla: o aluguel cai num dia so e
 * apagaria todas as outras marcas. E a mesma definicao da barra "Dia a dia"
 * (`gastoPorGrupo().variavel`), entao as marcas somam o numero da barra.
 */
export function gastoVariavelPorDia(compras: readonly Compra[], mes: string): number[] {
  const { ano, mes: indice } = partesDaChave(mes);
  const { inicio, fim } = intervaloDoMes(mes);
  const dias = new Array<number>(diasNoMes(ano, indice)).fill(0);

  for (const compra of compras) {
    if (!naoExcluido(compra) || compra.data < inicio || compra.data > fim) continue;
    if (grupoDaCategoria(compra.categoria) !== 'variavel') continue;
    const dia = new Date(compra.data).getDate();
    dias[dia - 1] = (dias[dia - 1] ?? 0) + compra.total;
  }
  return dias;
}

// ------------------------------------------------------ as barras do mes

export interface BarraDoMes {
  /** Centavos gastos no mes ate agora, neste grupo. */
  feito: number;
  /** O mes tipico do grupo: a media dos meses completos anteriores. */
  tipico: number;
  estado: EstadoDaBarra;
  /**
   * Onde o ritmo normal estaria hoje, de 0 a 1 na escala da barra. `null` no que
   * cai de uma vez (conta fixa), onde "hoje" nao diz nada.
   */
  hoje: number | null;
  /** O que ainda cabe por dia ate o fim do mes. So no "dia a dia". */
  restaPorDia: number | null;
  /** O gasto normal por dia, para a frase dizer "o normal e R$ X". */
  ritmoPorDia: number | null;
}

export interface BarrasDoMes {
  diaADia: BarraDoMes | null;
  fixas: BarraDoMes | null;
  /** Gasto eventual do mes. Nao entra em barra: fica fora da curva, a parte. */
  eventual: number;
  /** O gasto variavel de cada dia do mes (ver `gastoVariavelPorDia`). */
  dias: number[];
  /** Dia do mes em que estamos, de 1 a `dias.length`. */
  diaDeHoje: number;
}

/**
 * As barras do mes corrente, contra o mes tipico (`estimarGastoCorrente`).
 *
 * Os tres estados seguem o guia (`identidade-visual.md`): a barra "Dia a dia"
 * ESTOURA quando passou do tipico e APERTA quando o que resta por dia e menos que
 * a metade do ritmo normal — a mesma folga que o simulador usa. "Contas fixas"
 * so cabe ou estoura, porque conta fixa cai de uma vez e nao tem "ritmo".
 *
 * Grupo sem tipico (`estimativa` zerada) nao ganha barra: sem base, comparar
 * contra zero acusaria estouro que nao existe (Principio 0).
 */
export function barrasDoMes(
  compras: readonly Compra[],
  estimativa: Estimativa,
  agora: number,
): BarrasDoMes {
  const mes = chaveMes(agora);
  const { ano, mes: indice } = partesDaChave(mes);
  const { inicio, fim } = intervaloDoMes(mes);
  const grupos = gastoPorGrupo(compras, inicio, fim);
  const totalDeDias = diasNoMes(ano, indice);
  const dia = new Date(agora).getDate();

  let diaADia: BarraDoMes | null = null;
  if (estimativa.variavel > 0) {
    const tipico = estimativa.variavel;
    const feito = grupos.variavel;
    const ritmo = tipico / totalDeDias;
    const restam = totalDeDias - dia;
    const resta = tipico - feito;

    let estado: EstadoDaBarra = 'cabe';
    if (feito > tipico) estado = 'estoura';
    else if (restam > 0 && resta / restam < ritmo / 2) estado = 'aperta';

    diaADia = {
      feito,
      tipico,
      estado,
      hoje: (tipico * (dia / totalDeDias)) / Math.max(feito, tipico),
      restaPorDia: restam > 0 ? Math.round(Math.max(0, resta) / restam) : null,
      ritmoPorDia: Math.round(ritmo),
    };
  }

  let fixas: BarraDoMes | null = null;
  if (estimativa.fixo > 0) {
    fixas = {
      feito: grupos.fixo,
      tipico: estimativa.fixo,
      estado: grupos.fixo > estimativa.fixo ? 'estoura' : 'cabe',
      hoje: null,
      restaPorDia: null,
      ritmoPorDia: null,
    };
  }

  return {
    diaADia,
    fixas,
    eventual: grupos.eventual,
    dias: gastoVariavelPorDia(compras, mes),
    diaDeHoje: dia,
  };
}

// ------------------------------------------------------- seis meses de gasto

export interface MesDaSerie {
  mes: string;
  fixo: number;
  variavel: number;
  eventual: number;
  total: number;
  /** O mes corrente: ainda nao fechou, e a tela o desenha tracejado. */
  parcial: boolean;
}

/**
 * Os `quantos` meses que terminam em `ate`, com o gasto de cada grupo.
 *
 * Comeca no primeiro mes que tem compra: meses vazios antes disso nao sao "gastou
 * zero", sao "nao usava o app", e uma coluna de zero diria o contrario. Com menos
 * de dois meses com gasto nao ha serie para desenhar, e a funcao devolve `[]`.
 */
export function serieDeMeses(
  compras: readonly Compra[],
  ate: string,
  quantos: number,
  agora: number,
): MesDaSerie[] {
  const vivas = compras.filter(naoExcluido);
  if (vivas.length === 0) return [];

  const primeiro = vivas.reduce((menor, c) => Math.min(menor, c.data), Infinity);
  const desde = chaveMes(primeiro);
  const corrente = chaveMes(agora);

  const serie: MesDaSerie[] = [];
  for (let n = quantos - 1; n >= 0; n -= 1) {
    const mes = somarMeses(ate, -n);
    if (mes < desde) continue;
    const { inicio, fim } = intervaloDoMes(mes);
    const grupos = gastoPorGrupo(vivas, inicio, fim);
    serie.push({
      mes,
      ...grupos,
      total: grupos.fixo + grupos.variavel + grupos.eventual,
      parcial: mes === corrente,
    });
  }

  return serie.filter((m) => m.total > 0).length >= 2 ? serie : [];
}

// ------------------------------------------------ mes contra mes, justo

export interface LinhaComparada {
  nome: string;
  atual: number;
  anterior: number;
}

export interface Comparacao {
  mes: string;
  anterior: string;
  /** Ate que dia a comparacao vale nos dois meses. `null` = meses inteiros. */
  ateODia: number | null;
  linhas: LinhaComparada[];
  totalAtual: number;
  totalAnterior: number;
}

/**
 * Cada categoria neste mes contra o mes anterior, NO MESMO PERIODO.
 *
 * Mes em curso contra mes anterior inteiro perde sempre: no dia 9 voce gastou 9
 * dias contra 30. Por isso, no mes corrente os dois meses sao cortados no mesmo
 * dia (o do mes anterior limitado ao tamanho dele: dia 31 contra um mes de 30
 * dias leva o mes todo). Mes ja fechado compara meses inteiros.
 *
 * As `maximo` maiores ficam e o resto vira "Outras": uma parede de barras nao se
 * le (o mesmo motivo do teto em `Fatias`, no Resumo). Devolve `null` quando nao
 * ha compra em nenhum dos dois cortes.
 */
export function compararNoMesmoPeriodo(
  compras: readonly Compra[],
  mes: string,
  agora: number,
  maximo = 5,
): Comparacao | null {
  const anterior = mesAnterior(mes);
  const atualInt = intervaloDoMes(mes);
  const anteriorInt = intervaloDoMes(anterior);

  let ateODia: number | null = null;
  let fimAtual = atualInt.fim;
  let fimAnterior = anteriorInt.fim;

  if (mes === chaveMes(agora)) {
    const dia = new Date(agora).getDate();
    const a = partesDaChave(mes);
    const b = partesDaChave(anterior);
    ateODia = dia;
    fimAtual = fimDoDia(a.ano, a.mes, dia);
    fimAnterior = fimDoDia(b.ano, b.mes, Math.min(dia, diasNoMes(b.ano, b.mes)));
  }

  const somas = new Map<string, { atual: number; anterior: number }>();
  const somar = (nome: string, campo: 'atual' | 'anterior', valor: number) => {
    const linha = somas.get(nome) ?? { atual: 0, anterior: 0 };
    linha[campo] += valor;
    somas.set(nome, linha);
  };

  for (const compra of compras) {
    if (!naoExcluido(compra)) continue;
    const nome = compra.categoria || 'Sem definição';
    if (compra.data >= atualInt.inicio && compra.data <= fimAtual) somar(nome, 'atual', compra.total);
    else if (compra.data >= anteriorInt.inicio && compra.data <= fimAnterior) {
      somar(nome, 'anterior', compra.total);
    }
  }

  const todas: LinhaComparada[] = [...somas.entries()]
    .map(([nome, v]) => ({ nome, ...v }))
    .sort((a, b) => Math.max(b.atual, b.anterior) - Math.max(a.atual, a.anterior));

  const totalAtual = todas.reduce((soma, l) => soma + l.atual, 0);
  const totalAnterior = todas.reduce((soma, l) => soma + l.anterior, 0);
  if (totalAtual === 0 && totalAnterior === 0) return null;

  const linhas = todas.slice(0, maximo);
  const resto = todas.slice(maximo);
  if (resto.length > 0) {
    linhas.push({
      nome: 'Outras',
      atual: resto.reduce((soma, l) => soma + l.atual, 0),
      anterior: resto.reduce((soma, l) => soma + l.anterior, 0),
    });
  }

  return { mes, anterior, ateODia, linhas, totalAtual, totalAnterior };
}

// ------------------------------------------------- o que subiu no carrinho

export interface PontoDePreco {
  data: number;
  /** Centavos por unidade, como estava na prateleira. */
  preco: number;
}

export interface HistoricoDePreco {
  chave: string;
  nome: string;
  unidade: string;
  pontos: PontoDePreco[];
  /** `(ultimo - primeiro) / primeiro`. Positivo = subiu. */
  variacao: number;
}

/**
 * Os itens cujo preco mudou de verdade, do que mais mudou para o que menos.
 *
 * Mudanca que arredonda para 0% nao e noticia, e uma lista de itens "▲ 0%" so
 * esconde o que importa. Fica separado de `historicoDePreco` para a tela saber,
 * antes de desenhar o titulo, se ha o que mostrar.
 */
export function mudancasDePreco(
  historicos: readonly HistoricoDePreco[],
  maximo = 6,
): HistoricoDePreco[] {
  return historicos.filter((h) => Math.round(Math.abs(h.variacao) * 100) >= 1).slice(0, maximo);
}

/** Menos que isto nao e historico, e dois pontos que podem ser marca diferente. */
export const MINIMO_DE_PONTOS_DE_PRECO = 3;

/**
 * O preco de cada item ao longo das compras, e quanto mudou.
 *
 * A serie sai dos ITENS ligados a data da compra. O catalogo guarda so o ultimo
 * preco e o anterior (`dados/catalogo.ts`), entao nao tem como desenhar uma
 * linha: este e o mesmo join que `reconstruirCatalogo` faz.
 *
 * Duas cautelas para o numero nao mentir: so entram pontos na MESMA unidade da
 * compra mais recente (R$ 20 o kg e R$ 5 o pacote de 250 g nao se comparam), e
 * item com menos de `MINIMO_DE_PONTOS_DE_PRECO` pontos nao ganha historico. Fica
 * o preco dos ultimos `maximoDePontos` momentos; dois itens no mesmo dia viram um
 * ponto, o ultimo. `precoUnitario` e informacao historica (invariante 3): serve
 * para comparar, nunca para recalcular dinheiro.
 */
export function historicoDePreco(
  itens: readonly Item[],
  compras: readonly Compra[],
  maximoDePontos = 6,
): HistoricoDePreco[] {
  const dataDaCompra = new Map<string, number>();
  for (const compra of compras) {
    if (naoExcluido(compra)) dataDaCompra.set(compra.id, compra.data);
  }

  const porItem = new Map<string, { nome: string; unidade: string; pontos: (PontoDePreco & { unidade: string })[] }>();
  for (const item of itens) {
    if (!naoExcluido(item) || item.precoUnitario <= 0) continue;
    const data = dataDaCompra.get(item.compraId);
    const chave = normalizarNome(item.nome);
    if (data === undefined || !chave) continue;

    const atual = porItem.get(chave) ?? { nome: item.nome.trim(), unidade: item.unidade, pontos: [] };
    atual.pontos.push({ data, preco: item.precoUnitario, unidade: item.unidade });
    porItem.set(chave, atual);
  }

  const saida: HistoricoDePreco[] = [];
  for (const [chave, item] of porItem) {
    const ordenados = [...item.pontos].sort((a, b) => a.data - b.data);
    const maisRecente = ordenados[ordenados.length - 1]!;
    const mesmaUnidade = ordenados.filter((p) => p.unidade === maisRecente.unidade);

    // Dois itens no mesmo dia: fica o ultimo lancado.
    const porDia = new Map<number, PontoDePreco>();
    for (const p of mesmaUnidade) {
      const dia = new Date(p.data).setHours(0, 0, 0, 0);
      porDia.set(dia, { data: p.data, preco: p.preco });
    }
    const pontos = [...porDia.values()].sort((a, b) => a.data - b.data).slice(-maximoDePontos);
    if (pontos.length < MINIMO_DE_PONTOS_DE_PRECO) continue;

    const primeiro = pontos[0]!.preco;
    const ultimo = pontos[pontos.length - 1]!.preco;
    saida.push({
      chave,
      nome: item.nome,
      unidade: maisRecente.unidade,
      pontos,
      variacao: (ultimo - primeiro) / primeiro,
    });
  }

  return saida.sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao));
}
