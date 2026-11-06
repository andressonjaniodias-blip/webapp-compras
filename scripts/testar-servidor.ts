/**
 * Testes do que protege o servidor: senha, cookie, freios e validacao do lote.
 *
 * Sao as partes que NINGUEM exercita no uso normal — voce so descobre que a senha
 * malformada aceitava tudo, ou que o freio nao contava, no dia em que alguem tenta.
 * Por isso sao funcoes puras testadas aqui, sem subir o servidor.
 *
 * O que NAO cobre: as rotas do Hono (o `index.ts` sobe a porta ao ser importado).
 * Limite de corpo, cabecalhos e 429 se conferem subindo o app e chamando a API.
 *
 * Roda com: npm run teste:servidor
 */

import {
  conferirSenha,
  crachaDeTeste,
  crachaEhValido,
  gerarHash,
} from '../servidor/sessao';
import {
  consumirCotaDeIa,
  esperaDoLogin,
  limiteDiarioDaIa,
  limparFalhasDeLogin,
  registrarFalhaDeLogin,
  zerarLimites,
} from '../servidor/limites';
import { registroValido } from '../servidor/sincronizacao';

let falhas = 0;

function conferir(descricao: string, condicao: boolean, detalhe = ''): void {
  if (condicao) {
    console.log('  ok   ' + descricao);
  } else {
    falhas += 1;
    console.log('  FALHA ' + descricao + (detalhe ? '  -> ' + detalhe : ''));
  }
}

const MINUTO = 60_000;

async function principal(): Promise<void> {
  console.log('\n1. Senha: so a certa entra, e hash quebrado nunca entra');
  const hash = gerarHash('uma senha boa');
  conferir('a senha certa passa', await conferirSenha('uma senha boa', hash));
  conferir('a errada nao passa', !(await conferirSenha('outra senha', hash)));
  conferir('vazia nao passa', !(await conferirSenha('', hash)));
  conferir('a certa com acento normalizado passa', await conferirSenha('uma senha boa'.normalize('NFD'), hash));
  conferir('hash vazio nunca passa', !(await conferirSenha('qualquer', '')));
  conferir('hash "scrypt$$" (config quebrada) nunca passa, nem com senha vazia', !(await conferirSenha('', 'scrypt$$')));
  conferir('hash com um byte so nunca passa', !(await conferirSenha('a', 'scrypt$00$00')));
  conferir('hash de outro formato nunca passa', !(await conferirSenha('x', 'bcrypt$aa$bb')));
  conferir('hash com partes a menos nunca passa', !(await conferirSenha('x', 'scrypt$aaaa')));

  console.log('\n2. Cookie de sessao: assinado, e expira');
  const valido = crachaDeTeste(Date.now() + 10 * MINUTO);
  conferir('o cracha assinado e valido', crachaEhValido(valido));
  conferir('o vencido nao e', !crachaEhValido(crachaDeTeste(Date.now() - MINUTO)));
  const [carga, assinatura] = [valido.slice(0, valido.lastIndexOf('.')), valido.slice(valido.lastIndexOf('.') + 1)];
  const trocado = assinatura.slice(0, -1) + (assinatura.endsWith('0') ? '1' : '0');
  conferir('assinatura adulterada nao passa', !crachaEhValido(`${carga}.${trocado}`));
  conferir('prazo estendido sem reassinar nao passa', !crachaEhValido(`${Date.now() + 99_999_999}.${assinatura}`));
  conferir('sem assinatura nao passa', !crachaEhValido(carga));
  conferir('lixo nao passa', !crachaEhValido('lixo'));
  conferir('vazio nao passa', !crachaEhValido(''));
  conferir('indefinido nao passa', !crachaEhValido(undefined));

  console.log('\n3. Freio do login: 5 erros por origem, e um teto geral');
  zerarLimites();
  const t0 = Date.now();
  conferir('origem limpa pode tentar', esperaDoLogin('1.1.1.1', t0) === 0);
  for (let i = 0; i < 4; i += 1) registrarFalhaDeLogin('1.1.1.1', t0 + i);
  conferir('com 4 erros ainda pode', esperaDoLogin('1.1.1.1', t0 + 10) === 0);
  registrarFalhaDeLogin('1.1.1.1', t0 + 5);
  const espera = esperaDoLogin('1.1.1.1', t0 + 10);
  conferir('no quinto erro fica bloqueada', espera > 0, String(espera));
  conferir('e a espera cabe nos 15 minutos', espera <= 15 * 60, String(espera));
  conferir('outra origem nao e afetada', esperaDoLogin('2.2.2.2', t0 + 10) === 0);
  conferir('passados 15 minutos, libera', esperaDoLogin('1.1.1.1', t0 + 16 * MINUTO) === 0);
  limparFalhasDeLogin('1.1.1.1');
  conferir('acertar a senha zera o contador', esperaDoLogin('1.1.1.1', t0 + 10) === 0);

  zerarLimites();
  for (let i = 0; i < 30; i += 1) registrarFalhaDeLogin(`10.0.0.${i}`, t0 + i);
  conferir(
    'trinta erros no total bloqueiam ate uma origem nova (ataque distribuido)',
    esperaDoLogin('9.9.9.9', t0 + 100) > 0,
  );

  console.log('\n4. Teto diario da IA');
  zerarLimites();
  process.env.LIMITE_IA_DIA = '3';
  conferir('o limite vem da variavel', limiteDiarioDaIa() === 3);
  const hoje = new Date(2026, 10, 5, 12).getTime();
  conferir('1a chamada passa', consumirCotaDeIa(hoje));
  conferir('2a passa', consumirCotaDeIa(hoje));
  conferir('3a passa', consumirCotaDeIa(hoje));
  conferir('4a e barrada', !consumirCotaDeIa(hoje));
  conferir('continua barrada no mesmo dia', !consumirCotaDeIa(hoje + 5 * 60 * MINUTO));
  conferir('no dia seguinte volta a valer', consumirCotaDeIa(new Date(2026, 10, 6, 8).getTime()));
  process.env.LIMITE_IA_DIA = 'lixo';
  conferir('valor invalido cai no padrao (30)', limiteDiarioDaIa() === 30);
  process.env.LIMITE_IA_DIA = '0';
  conferir('zero tambem cai no padrao (nao desliga a IA sem querer)', limiteDiarioDaIa() === 30);
  delete process.env.LIMITE_IA_DIA;

  console.log('\n5. Validacao do registro que chega pela sincronizacao');
  const compra = { id: 'c1', data: 1000, atualizadoEm: 2000, excluidoEm: null };
  conferir('compra completa e valida', registroValido(compra, 'compras'));
  conferir('com lapide numerica e valida', registroValido({ ...compra, excluidoEm: 3000 }, 'compras'));
  conferir('sem excluidoEm tambem', registroValido({ id: 'c1', data: 1, atualizadoEm: 2 }, 'compras'));
  conferir('sem data (NOT NULL) e invalida', !registroValido({ ...compra, data: undefined }, 'compras'));
  conferir('data como texto e invalida', !registroValido({ ...compra, data: '2026-01-01' }, 'compras'));
  conferir('sem id e invalida', !registroValido({ ...compra, id: undefined }, 'compras'));
  conferir('id vazio e invalido', !registroValido({ ...compra, id: '' }, 'compras'));
  conferir('id gigante e invalido', !registroValido({ ...compra, id: 'x'.repeat(101) }, 'compras'));
  conferir('atualizadoEm NaN e invalido', !registroValido({ ...compra, atualizadoEm: NaN }, 'compras'));
  conferir('atualizadoEm negativo e invalido', !registroValido({ ...compra, atualizadoEm: -1 }, 'compras'));
  conferir('excluidoEm em texto e invalido', !registroValido({ ...compra, excluidoEm: 'ontem' }, 'compras'));
  conferir('null e invalido', !registroValido(null, 'compras'));
  conferir('texto solto e invalido', !registroValido('compra', 'compras'));
  conferir('item exige compraId', !registroValido({ id: 'i1', atualizadoEm: 1 }, 'itens'));
  conferir('item com compraId e valido', registroValido({ id: 'i1', compraId: 'c1', atualizadoEm: 1 }, 'itens'));
  conferir('divida exige primeiraEm', !registroValido({ id: 'd1', atualizadoEm: 1 }, 'dividas'));
  conferir('regra so exige o basico', registroValido({ id: 'r1', atualizadoEm: 1 }, 'regras'));

  console.log('');
  if (falhas > 0) {
    console.log(falhas + ' verificacao(oes) falharam.');
    process.exit(1);
  }
  console.log('Servidor: todas as verificacoes passaram.');
  process.exit(0);
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
