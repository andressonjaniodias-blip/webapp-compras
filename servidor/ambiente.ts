/**
 * Carrega o `.env` quando ele existe.
 *
 * Sem dependencia externa: o Node ja sabe fazer isso desde a versao 20.12. Em
 * producao (Render) nao ha arquivo nenhum — as variaveis vem do painel — e a
 * ausencia do arquivo nao pode derrubar o servidor, dai o try/catch mudo.
 */
export function carregarAmbiente(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Sem .env: as variaveis vem do ambiente, que e o caso em producao.
  }
}
