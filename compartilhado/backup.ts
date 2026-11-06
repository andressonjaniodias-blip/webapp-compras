/**
 * A regra de restaurar um backup, sem Dexie nem navegador: so a decisao.
 *
 * Restaurar com `bulkPut` direto fazia o arquivo ganhar SEMPRE: um backup de
 * semana passada, importado hoje, sobrescrevia a edicao de ontem que ainda nem
 * tinha subido para a nuvem — e a edicao se perdia sem erro nenhum. A mesma regra
 * de quem vence na sincronizacao vale aqui: o `atualizadoEm` maior manda.
 *
 * Mora em `compartilhado/` para ser testada em `teste:contas`, que roda no Node.
 */

interface Carimbado {
  id: string;
  atualizadoEm: number;
}

/**
 * Do que vem no arquivo, fica so o que NAO e mais velho que o que o aparelho ja tem.
 *
 * - Registro que o aparelho nao tem: entra (restaurar num aparelho vazio traz tudo).
 * - Registro que o aparelho tem, com `atualizadoEm` maior ou igual: o aparelho vence,
 *   e o do arquivo e ignorado (igual nao precisa voltar para a fila de envio).
 * - Registro do arquivo mais novo que o do aparelho: entra.
 */
export function filtrarBackupMaisNovo<T extends Carimbado>(
  doArquivo: readonly T[],
  noAparelho: readonly Carimbado[],
): T[] {
  const atuais = new Map(noAparelho.map((r) => [r.id, r.atualizadoEm]));
  return doArquivo.filter((registro) => {
    const atual = atuais.get(registro.id);
    return atual === undefined || registro.atualizadoEm > atual;
  });
}
