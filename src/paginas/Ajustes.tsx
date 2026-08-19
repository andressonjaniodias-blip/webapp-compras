/**
 * Sincronizacao, exportacao e backup.
 *
 * Duas coisas aqui sao plano de recuperacao, nao conveniencia:
 *
 * - "Reenviar tudo" reconstroi a nuvem inteira a partir deste aparelho. Como o
 *   dado real mora aqui, perder o banco na nuvem vira uma tarefa de dois
 *   minutos em vez de uma perda definitiva.
 * - O backup .json e a copia que nao depende de provedor nenhum. Sai e volta,
 *   com as lapides junto, para uma compra excluida nao ressuscitar na
 *   restauracao.
 */

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportarBackup, exportarCsv, exportarExcel, importarBackup } from '../lib/exportar';
import { reenviarTudo } from '../dados/sincronizacao';
import { formatarDataHora } from '../lib/datas';
import { useApp } from '../estado';

export function Ajustes() {
  const navegar = useNavigate();
  const {
    pendentes, ultimaEm, situacao, offline, iaLigada,
    sincronizarAgora, encerrarSessao, atualizarPendentes,
  } = useApp();

  const [recado, setRecado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  async function tentar(acao: () => Promise<string>) {
    setOcupado(true);
    setRecado(null);
    setErro(null);
    try {
      setRecado(await acao());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não deu certo.');
    } finally {
      setOcupado(false);
      await atualizarPendentes();
    }
  }

  async function aoEscolherArquivo(lista: FileList | null) {
    const escolhido = lista?.[0];
    if (!escolhido) return;
    await tentar(async () => {
      const resultado = await importarBackup(await escolhido.text());
      return `Restaurados ${resultado.compras} compra(s) e ${resultado.itens} item(ns). Sincronize para enviá-los.`;
    });
  }

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={() => navegar('/')}>
            ‹
          </button>
          <h1>Ajustes</h1>
        </div>
      </header>

      {recado && <p className="aviso">{recado}</p>}
      {erro && <p className="aviso aviso-erro">{erro}</p>}

      <h2 className="secao-titulo">Sincronização</h2>
      <div className="cartao">
        <p style={{ margin: '0 0 10px' }}>
          {pendentes === 0
            ? 'Tudo sincronizado.'
            : `${pendentes} registro(s) esperando para subir.`}
          {offline && ' O servidor está inalcançável no momento.'}
        </p>
        <p className="dica" style={{ marginBottom: 12 }}>
          {ultimaEm ? 'Última vez: ' + formatarDataHora(ultimaEm) : 'Ainda não sincronizou neste aparelho.'}
        </p>

        <div className="acoes" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="botao botao-primario botao-largo"
            disabled={situacao === 'sincronizando' || ocupado}
            onClick={() => void sincronizarAgora(true)}
          >
            {situacao === 'sincronizando' ? 'Sincronizando…' : 'Sincronizar agora'}
          </button>

          <button
            type="button"
            className="botao botao-largo"
            disabled={situacao === 'sincronizando' || ocupado}
            onClick={() =>
              void tentar(async () => {
                const r = await reenviarTudo();
                return `Reenviados ${r.enviados} registro(s) para a nuvem.`;
              })
            }
          >
            Reenviar tudo para a nuvem
          </button>
        </div>
        <p className="dica">
          Reenviar tudo serve para reconstruir a nuvem caso o banco lá se perca. Não apaga
          nada daqui.
        </p>
      </div>

      <h2 className="secao-titulo">Exportar</h2>
      <div className="cartao">
        <div className="acoes" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="botao botao-largo"
            disabled={ocupado}
            onClick={() => void tentar(async () => { await exportarExcel(); return 'Planilha gerada.'; })}
          >
            Planilha .xlsx (duas abas)
          </button>
          <button
            type="button"
            className="botao botao-largo"
            disabled={ocupado}
            onClick={() => void tentar(async () => { await exportarCsv(); return 'CSV gerado.'; })}
          >
            Arquivo .csv
          </button>
        </div>
        <p className="dica">
          A planilha sai com valores como número e datas como data, então soma e tabela
          dinâmica funcionam.
        </p>
      </div>

      <h2 className="secao-titulo">Backup</h2>
      <div className="cartao">
        <div className="acoes" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="botao botao-largo"
            disabled={ocupado}
            onClick={() => void tentar(async () => { await exportarBackup(); return 'Backup salvo.'; })}
          >
            Salvar backup .json
          </button>
          <button
            type="button"
            className="botao botao-largo"
            disabled={ocupado}
            onClick={() => arquivo.current?.click()}
          >
            Restaurar backup .json
          </button>
          <input
            ref={arquivo}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void aoEscolherArquivo(e.target.files)}
          />
        </div>
      </div>

      <h2 className="secao-titulo">Conta</h2>
      <div className="cartao">
        <p className="dica" style={{ marginTop: 0 }}>
          Dicas de IA: {iaLigada ? 'ligadas' : 'desligadas (sem chave no servidor)'}.
        </p>
        <button type="button" className="botao botao-largo botao-perigo" onClick={() => void encerrarSessao()}>
          Sair desta sessão
        </button>
        <p className="dica">
          Sair não apaga nada deste aparelho — só desconecta da nuvem até você entrar de novo.
        </p>
      </div>
    </div>
  );
}
