/**
 * Aplica `esquema.sql` no banco configurado.
 *
 * Com DATABASE_URL, vai para o Neon. Sem ela, cria o Postgres local em
 * `.dados/`. Todos os comandos sao IF NOT EXISTS, entao rodar de novo nao
 * quebra nada — util depois de perder o banco e precisar recriar.
 */
import { readFile } from 'node:fs/promises';
import { carregarAmbiente } from '../servidor/ambiente';

carregarAmbiente();

const { banco, comandosDoEsquema, ehBancoLocal } = await import('../servidor/banco');

const consultar = await banco();
const esquema = await readFile('esquema.sql', 'utf8');

let aplicados = 0;
for (const comando of comandosDoEsquema(esquema)) {
  await consultar(comando);
  aplicados += 1;
}

console.log(`${aplicados} comandos aplicados em ${ehBancoLocal() ? '.dados/postgres (local)' : 'Neon'}.`);
process.exit(0);
