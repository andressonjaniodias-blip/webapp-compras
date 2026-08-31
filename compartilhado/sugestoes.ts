/**
 * As regras de ordenacao e busca das sugestoes de item.
 *
 * Ficam aqui, e nao dentro de `src/dados/catalogo.ts`, por um motivo pratico:
 * la elas dependeriam do Dexie e nao teria como testa-las fora do navegador.
 * Sao funcoes puras sobre numeros e texto — exatamente o tipo de coisa que
 * merece teste automatizado, porque errar aqui nao quebra nada, so faz a
 * sugestao certa parar de aparecer e ninguem descobre o porque.
 */

const DIA_EM_MS = 86_400_000;

/** O minimo que a ordenacao precisa saber de uma entrada do catalogo. */
export interface Sugerivel {
  chave: string;
  ultimaCompraEm: number;
  ultimaCategoria: string;
  vezes: number;
}

/**
 * Peso da recencia no escore.
 *
 * Antes, `vezes` mandava e a recencia so desempatava — entao um item comprado 30
 * vezes no ano passado ficava eternamente acima do que voce compra toda semana
 * agora. Faixas explicitas em vez de uma curva continua porque o resultado
 * precisa ser previsivel e conferivel; ninguem verifica de cabeça uma
 * exponencial.
 */
export function fatorDeRecencia(ultimaCompraEm: number, agora: number): number {
  const dias = (agora - ultimaCompraEm) / DIA_EM_MS;
  if (dias <= 30) return 1;
  if (dias <= 90) return 0.6;
  if (dias <= 180) return 0.3;
  return 0.1;
}

/** Item da mesma categoria da compra em andamento desempata na frente. */
const BONUS_MESMA_CATEGORIA = 1.35;

export function escoreDaSugestao(
  entrada: Sugerivel,
  agora: number,
  categoriaAtual?: string,
): number {
  const base = entrada.vezes * fatorDeRecencia(entrada.ultimaCompraEm, agora);
  const bonus =
    categoriaAtual && entrada.ultimaCategoria === categoriaAtual ? BONUS_MESMA_CATEGORIA : 1;
  return base * bonus;
}

/**
 * Todas as palavras do termo aparecem no nome, em qualquer ordem?
 *
 * Antes era `includes` da frase inteira, entao "ninho leite" nao encontrava
 * "Leite Ninho" — e a pessoa concluia que o item nao estava cadastrado e
 * digitava tudo de novo. Sem correcao de digitacao: ela traria falso positivo e
 * nao vale o custo aqui.
 */
export function casaTermo(chave: string, termo: string): boolean {
  const palavras = termo.split(' ').filter(Boolean);
  if (palavras.length === 0) return true;
  return palavras.every((palavra) => chave.includes(palavra));
}

/** Ordena candidatos: quem começa com o termo primeiro, depois pelo escore. */
export function ordenarSugestoes<T extends Sugerivel>(
  candidatos: readonly T[],
  termo: string,
  agora: number,
  categoriaAtual?: string,
): T[] {
  return [...candidatos].sort((a, b) => {
    if (termo) {
      const aComeca = a.chave.startsWith(termo) ? 0 : 1;
      const bComeca = b.chave.startsWith(termo) ? 0 : 1;
      if (aComeca !== bComeca) return aComeca - bComeca;
    }
    const escoreA = escoreDaSugestao(a, agora, categoriaAtual);
    const escoreB = escoreDaSugestao(b, agora, categoriaAtual);
    if (escoreB !== escoreA) return escoreB - escoreA;
    return b.ultimaCompraEm - a.ultimaCompraEm;
  });
}
