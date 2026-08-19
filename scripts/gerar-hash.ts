/**
 * Gera o valor de SENHA_HASH a partir de uma senha.
 *
 * Uso: npm run senha:hash -- "minha senha"
 *
 * A senha em texto nunca e gravada em lugar nenhum — nem em arquivo, nem no
 * historico do projeto. Sai so o hash, que e o que vai para a variavel de
 * ambiente do servidor.
 */
import { gerarHash } from '../servidor/sessao';

const senha = process.argv.slice(2).join(' ').trim();

if (!senha) {
  console.error('Uso: npm run senha:hash -- "sua senha aqui"');
  process.exit(1);
}

if (senha.length < 8) {
  console.error('Use pelo menos 8 caracteres. Esta senha é a única tranca do app.');
  process.exit(1);
}

console.log('');
console.log('Coloque esta linha no .env local e no painel do Render:');
console.log('');
console.log('SENHA_HASH=' + gerarHash(senha));
console.log('');
