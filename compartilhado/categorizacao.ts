/**
 * O app adivinha a categoria — sem gastar IA e sem internet.
 *
 * O sinal mais forte nao e um modelo de linguagem: e o proprio historico. Se
 * "Supermercado Bom Preço" virou Mercado nas ultimas doze vezes, a decima
 * terceira e Mercado, e nenhum modelo sabe disso melhor que o banco local.
 *
 * A cascata vai da maior para a menor confiança e para na primeira que casar:
 *
 *   1. regra do usuario ............... certeza
 *   2. descricao ja usada 3+ vezes .... alta
 *   3. descricao ja usada 1-2 vezes ... media
 *   4. votacao dos itens lançados ..... media
 *   5. palavra-chave embutida ......... media
 *   6. nada casou ..................... nenhuma
 *
 * Cada palpite carrega o MOTIVO, e ele sai da mesma decisao que escolheu — nao
 * de uma reconstrucao posterior, que poderia divergir do que realmente
 * aconteceu. Mostrar o motivo e o que separa automacao confiavel de automacao
 * irritante: da para corrigir na hora, em vez de descobrir semanas depois que
 * metade do mes foi para a categoria errada.
 *
 * A lista embutida de palavras-chave e curta e so com termos sem ambiguidade de
 * proposito. Ela e o chute inicial de quem acabou de instalar; depois de duas
 * semanas de uso quem manda e o historico da propria pessoa.
 */

import { naoExcluido, normalizarNome, type Compra, type RegraCategoria } from './tipos';

export type Confianca = 'certeza' | 'alta' | 'media' | 'nenhuma';

export type ModoCategorizacao = 'desligado' | 'sugerir' | 'automatico';

export const MODO_PADRAO: ModoCategorizacao = 'sugerir';

export interface Palpite {
  categoria: string | null;
  confianca: Confianca;
  /** Texto pronto para a tela: "você lançou assim nas últimas 12 vezes". */
  motivo: string;
}

const SEM_PALPITE: Palpite = { categoria: null, confianca: 'nenhuma', motivo: '' };

/**
 * Termos que sugerem categoria por si sos.
 *
 * Termo com espaço casa como frase; termo de uma palavra casa quando alguma
 * palavra da descricao começa com ele — mas termos curtos (menos de 5 letras)
 * exigem palavra exata, senao "luz" casaria dentro de "Luzia".
 */
export const PALAVRAS_CHAVE: Readonly<Record<string, readonly string[]>> = {
  'Mercado': ['supermercado', 'mercado', 'mercearia', 'atacad', 'hortifruti', 'sacolao', 'acougue'],
  'Comer fora': ['restaurante', 'lanchonete', 'pizzaria', 'churrascaria', 'cafeteria', 'ifood', 'delivery'],
  'Combustível': ['posto', 'gasolina', 'etanol', 'combustivel', 'alcool'],
  'Transporte': ['uber', 'taxi', 'onibus', 'estacionamento', 'pedagio', 'passagem'],
  'Farmácia': ['farmacia', 'drogaria'],
  'Saúde': ['clinica', 'laboratorio', 'dentista', 'hospital', 'consulta', 'exame'],
  'Contas de casa': ['energia', 'energisa', 'saneamento', 'cagepa', 'internet', 'condominio', 'aluguel', 'luz', 'agua', 'gas'],
  'Assinaturas': ['netflix', 'spotify', 'assinatura', 'academia', 'streaming', 'disney'],
  'Educação': ['escola', 'faculdade', 'mensalidade', 'creche', 'curso'],
  'Pets': ['petshop', 'pet shop', 'veterinaria', 'racao'],
  'Beleza e cuidados': ['salao', 'barbearia', 'cabeleireiro', 'manicure'],
  'Taxas e impostos': ['iptu', 'ipva', 'licenciamento', 'imposto', 'tarifa', 'multa', 'darf'],
};

function casa(descricao: string, termo: string): boolean {
  if (termo.includes(' ')) return descricao.includes(termo);
  const palavras = descricao.split(' ');
  return palavras.some((palavra) =>
    termo.length >= 5 ? palavra.startsWith(termo) : palavra === termo,
  );
}

// -------------------------------------------------------------- historico

export interface UsoDaDescricao {
  categoria: string;
  vezes: number;
}

/**
 * Descricao normalizada -> categoria mais usada com ela.
 *
 * E derivado das compras: nada a armazenar, nada a sincronizar, cada aparelho
 * reconstroi o seu. E o mesmo racional do catalogo de sugestoes.
 *
 * `excetoId` existe por um motivo que so aparece na tela: a compra que esta
 * sendo editada JA ESTA no banco, com a categoria que ela herdou da anterior.
 * Sem tira-la da conta, digitar a descricao faz o app "aprender" com a propria
 * compra e concluir que a categoria atual esta certa — o palpite se
 * autoconfirma, e nenhum outro sinal chega a ser consultado.
 */
export function resumirHistorico(
  compras: readonly Compra[],
  excetoId?: string,
): Map<string, UsoDaDescricao> {
  const contagem = new Map<string, Map<string, number>>();

  for (const compra of compras) {
    if (!naoExcluido(compra) || compra.id === excetoId) continue;
    const chave = normalizarNome(compra.descricao);
    const categoria = compra.categoria.trim();
    if (!chave || !categoria) continue;

    const porCategoria = contagem.get(chave) ?? new Map<string, number>();
    porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + 1);
    contagem.set(chave, porCategoria);
  }

  const saida = new Map<string, UsoDaDescricao>();
  for (const [chave, porCategoria] of contagem) {
    let melhor = '';
    let vezes = 0;
    for (const [categoria, n] of porCategoria) {
      if (n > vezes) {
        melhor = categoria;
        vezes = n;
      }
    }
    if (melhor) saida.set(chave, { categoria: melhor, vezes });
  }
  return saida;
}

// ---------------------------------------------------------------- cascata

export interface EntradaCascata {
  descricao: string;
  /** Nomes dos itens ja lançados nesta compra. */
  itens: readonly string[];
  regras: readonly RegraCategoria[];
  historico: ReadonlyMap<string, UsoDaDescricao>;
  /** Nome normalizado do item -> categoria sob a qual ele costuma ser comprado. */
  porItem: ReadonlyMap<string, string>;
}

export function adivinharCategoria(entrada: EntradaCascata): Palpite {
  const descricao = normalizarNome(entrada.descricao);

  // 1. Regra do usuario. Intencao explicita vence qualquer deducao.
  if (descricao) {
    const regras = [...entrada.regras]
      .filter((regra) => naoExcluido(regra) && regra.termo && regra.categoria)
      .sort((a, b) => a.ordem - b.ordem);

    for (const regra of regras) {
      if (casa(descricao, regra.termo)) {
        return {
          categoria: regra.categoria,
          confianca: 'certeza',
          motivo: `sua regra: "${regra.termo}" é ${regra.categoria}`,
        };
      }
    }
  }

  // 2 e 3. O que voce mesmo ja fez com esta descricao.
  const uso = descricao ? entrada.historico.get(descricao) : undefined;
  if (uso) {
    return {
      categoria: uso.categoria,
      confianca: uso.vezes >= 3 ? 'alta' : 'media',
      motivo:
        uso.vezes === 1
          ? 'você lançou assim uma vez'
          : `você lançou assim nas últimas ${uso.vezes} vezes`,
    };
  }

  // 4. Os itens votam. Serve para loja nova cujo nome o app nunca viu.
  const voto = votacaoDosItens(entrada.itens, entrada.porItem);
  if (voto) return voto;

  // 5. A lista embutida — o chute de quem acabou de instalar.
  if (descricao) {
    for (const [categoria, termos] of Object.entries(PALAVRAS_CHAVE)) {
      for (const termo of termos) {
        if (casa(descricao, termo)) {
          return { categoria, confianca: 'media', motivo: `"${termo}" costuma ser ${categoria}` };
        }
      }
    }
  }

  return SEM_PALPITE;
}

function votacaoDosItens(
  itens: readonly string[],
  porItem: ReadonlyMap<string, string>,
): Palpite | null {
  if (itens.length === 0) return null;

  const votos = new Map<string, number>();
  for (const nome of itens) {
    const categoria = porItem.get(normalizarNome(nome));
    if (!categoria) continue;
    votos.set(categoria, (votos.get(categoria) ?? 0) + 1);
  }
  if (votos.size === 0) return null;

  let vencedora = '';
  let melhor = 0;
  let total = 0;
  for (const [categoria, n] of votos) {
    total += n;
    if (n > melhor) {
      vencedora = categoria;
      melhor = n;
    }
  }

  // Maioria simples nao basta: dois itens empatados nao dizem nada.
  if (melhor * 2 <= total) return null;

  return {
    categoria: vencedora,
    confianca: 'media',
    motivo: `${melhor} de ${total} ${total === 1 ? 'item costuma ser' : 'itens costumam ser'} ${vencedora}`,
  };
}

/** No modo automatico so entra o que o app tem motivo forte para afirmar. */
export function deveAplicarSozinho(palpite: Palpite, modo: ModoCategorizacao): boolean {
  if (modo !== 'automatico') return false;
  return palpite.confianca === 'certeza' || palpite.confianca === 'alta';
}

// ------------------------------------------------------ revisao retroativa

export interface Proposta {
  compraId: string;
  descricao: string;
  data: number;
  total: number;
  de: string;
  para: string;
  motivo: string;
  confianca: Confianca;
}

/**
 * Varre compras ja lançadas e propoe categoria para as que estao em "Outros" ou
 * vazias.
 *
 * Nada e aplicado aqui: a tela mostra a lista e o usuario aceita o que quiser. E
 * a forma de o historico velho passar a valer para o resumo e para a previsao,
 * sem reescrever nada nas costas de ninguem.
 */
export function propostasDeRevisao(
  compras: readonly Compra[],
  contexto: Omit<EntradaCascata, 'descricao' | 'itens'>,
  itensPorCompra: ReadonlyMap<string, readonly string[]>,
  categoriasAmbiguas: readonly string[] = ['', 'Outros'],
): Proposta[] {
  const saida: Proposta[] = [];

  for (const compra of compras) {
    if (!naoExcluido(compra)) continue;
    if (!categoriasAmbiguas.includes(compra.categoria)) continue;

    const palpite = adivinharCategoria({
      ...contexto,
      descricao: compra.descricao,
      itens: itensPorCompra.get(compra.id) ?? [],
    });

    if (!palpite.categoria || palpite.categoria === compra.categoria) continue;
    if (palpite.confianca === 'nenhuma') continue;

    saida.push({
      compraId: compra.id,
      descricao: compra.descricao || '(sem descrição)',
      data: compra.data,
      total: compra.total,
      de: compra.categoria || 'sem categoria',
      para: palpite.categoria,
      motivo: palpite.motivo,
      confianca: palpite.confianca,
    });
  }

  return saida.sort((a, b) => b.data - a.data);
}
