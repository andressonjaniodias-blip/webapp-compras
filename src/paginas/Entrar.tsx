/**
 * A tela de senha. Um campo, um botao.
 *
 * Sem cadastro, sem "esqueci minha senha" e sem lista de usuarios: e um app de
 * uma pessoa so, e a senha vive como hash numa variavel de ambiente do
 * servidor. Se ela se perder, a saida e gerar outra com `npm run senha:hash` e
 * trocar a variavel — nenhum dado se perde nisso, porque as compras estao no
 * aparelho.
 */

import { useState, type FormEvent } from 'react';
import { useApp } from '../estado';

export function Entrar() {
  const { autenticar } = useApp();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (!senha || entrando) return;

    setEntrando(true);
    setErro(null);
    try {
      await autenticar(senha);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível entrar.');
      setSenha('');
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="entrar">
      <h1>Compras</h1>
      <p className="dica">
        Este app é particular. Entre com a senha para sincronizar e usar as dicas.
      </p>

      <form onSubmit={aoEnviar}>
        <div className="campo">
          <label className="campo-rotulo" htmlFor="senha">Senha</label>
          <input
            id="senha"
            className="entrada"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>

        {erro && <p className="aviso aviso-erro">{erro}</p>}

        <button
          type="submit"
          className="botao botao-primario botao-largo"
          disabled={!senha || entrando}
        >
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="dica" style={{ marginTop: 18 }}>
        O servidor pode levar até um minuto para acordar na primeira vez do dia.
      </p>
    </div>
  );
}
