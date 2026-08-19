/**
 * Gera o SESSAO_SEGREDO — a chave que assina o cookie de sessão.
 *
 * Existe como comando porque este é o passo mais fácil de errar na publicação:
 * "qualquer string longa e aleatória" convida a digitar algo curto e adivinhável,
 * e quem consegue adivinhar esse valor consegue forjar uma sessão sem nunca
 * saber a senha.
 *
 * Trocar o valor depois não perde dado nenhum — só desconecta os aparelhos, que
 * voltam com um login.
 */
import { randomBytes } from 'node:crypto';

console.log('');
console.log('Coloque esta linha no painel do Render (e no .env local, se for testar):');
console.log('');
console.log('SESSAO_SEGREDO=' + randomBytes(48).toString('base64url'));
console.log('');
