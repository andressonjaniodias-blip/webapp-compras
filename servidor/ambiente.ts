/**
 * Carrega o `.env` quando ele existe.
 *
 * Sem dependencia externa: o Node ja sabe fazer isso desde a versao 20.12. Em
 * producao (Render) nao ha arquivo nenhum — as variaveis vem do painel — e a
 * ausencia do arquivo nao pode derrubar o servidor, dai o try/catch mudo.
 */
export function carregarAmbiente(): void {
  // O fuso do usuario, e nao o do servidor. O Render roda em UTC, e sem isto uma
  // compra das 22h em Brasilia cairia no mes seguinte na analise da IA e no
  // orcamento, porque `Date` decide mes e dia pelo fuso do processo. Respeita um
  // TZ ja definido (o painel do Render, ou um teste).
  process.env.TZ ??= 'America/Sao_Paulo';

  try {
    process.loadEnvFile('.env');
  } catch {
    // Sem .env: as variaveis vem do ambiente, que e o caso em producao.
  }
}
