/**
 * O dinheiro que entra.
 *
 * A tela que mais precisava de cuidado e a do AUMENTO DE SALARIO. Editar o valor
 * de uma renda mensal no lugar reescreveria o passado: com um aumento em julho,
 * janeiro a junho passariam a valer o valor novo e todo resumo anterior ficaria
 * errado — sem quebrar nada, e por isso sem ninguem perceber.
 *
 * Entao mudar o valor de uma renda recorrente pergunta *a partir de quando*. Se
 * foi aumento, a renda antiga ganha fim e uma nova começa: o historico continua
 * verdadeiro e a previsao passa a usar o valor certo. Se foi erro de digitacao,
 * a correcao vale desde sempre, que e o que a pessoa quer nesse caso.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { SeletorChips } from '../componentes/SeletorChips';
import { ORIGENS_RENDA, PERIODICIDADES } from '../../compartilhado/constantes';
import { ocorrenciasDeRenda } from '../../compartilhado/carteira';
import type { Periodicidade, Renda } from '../../compartilhado/tipos';
import {
  alterarRendaRecorrente,
  atualizarRenda,
  corrigirRenda,
  criarRenda,
  excluirRenda,
  listarContas,
  listarRendas,
} from '../dados/financas';
import { formatarReais } from '../lib/dinheiro';
import { deInputDataHora, formatarData, paraInputDataHora } from '../lib/datas';
import { useApp } from '../estado';

export function Rendas() {
  const navegar = useNavigate();
  const { atualizarPendentes } = useApp();
  const rendas = useLiveQuery(listarRendas, [], undefined);
  const contas = useLiveQuery(listarContas, [], []);
  const [editando, setEditando] = useState<string | null>(null);

  async function nova() {
    const id = await criarRenda({ origem: ORIGENS_RENDA[0], periodicidade: 'mensal' });
    await atualizarPendentes();
    setEditando(id);
  }

  const vigentes = (rendas ?? []).filter((r) => r.encerradoEm === null);
  const encerradas = (rendas ?? []).filter((r) => r.encerradoEm !== null);

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={() => navegar('/carteira')}>
            ‹
          </button>
          <h1>Entradas</h1>
        </div>
      </header>

      {rendas === undefined && <p className="carregando">Carregando…</p>}

      {rendas !== undefined && rendas.length === 0 && (
        <p className="vazio">
          Nenhuma entrada ainda.
          <br />
          Cadastre seu salário uma vez e ele passa a contar todo mês sozinho.
        </p>
      )}

      <ul className="lista">
        {vigentes.map((renda) => (
          <Linha
            key={renda.id}
            renda={renda}
            contas={contas}
            aberta={editando === renda.id}
            onAbrir={() => setEditando(renda.id)}
            onFechar={async () => {
              await atualizarPendentes();
              setEditando(null);
            }}
          />
        ))}
      </ul>

      {encerradas.length > 0 && (
        <>
          <h2 className="secao-titulo">Encerradas</h2>
          <p className="dica">
            Continuam valendo para os meses em que estavam vigentes. É isso que mantém o
            histórico certo depois de um aumento.
          </p>
          <ul className="lista">
            {encerradas.map((renda) => (
              <li key={renda.id}>
                <div className="item-linha">
                  <div className="item-corpo">
                    <div className="item-nome">{renda.origem || 'Entrada'}</div>
                    <div className="item-meta">
                      {formatarData(renda.data)} até {formatarData(renda.encerradoEm!)}
                    </div>
                  </div>
                  <span className="item-valor">{formatarReais(renda.valor)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="rodape">
        <button type="button" className="botao botao-primario" onClick={nova}>
          Nova entrada
        </button>
      </div>
    </div>
  );
}

function Linha({
  renda,
  contas,
  aberta,
  onAbrir,
  onFechar,
}: {
  renda: Renda;
  contas: readonly { id: string; apelido: string }[];
  aberta: boolean;
  onAbrir: () => void;
  onFechar: () => Promise<void>;
}) {
  if (!aberta) {
    const quando =
      renda.periodicidade === 'mensal'
        ? `todo dia ${new Date(renda.data).getDate()}`
        : renda.periodicidade === 'anual'
          ? `todo ano em ${formatarData(renda.data).slice(0, 5)}`
          : formatarData(renda.data);

    return (
      <li>
        <button type="button" className="compra" onClick={onAbrir}>
          <div className="compra-corpo">
            <div className="compra-titulo">{renda.origem || renda.descricao || 'Entrada'}</div>
            <div className="compra-meta">
              {quando}
              {renda.contaId && ` · cai em ${contas.find((c) => c.id === renda.contaId)?.apelido ?? 'outra conta'}`}
            </div>
          </div>
          <span className="compra-valor">{formatarReais(renda.valor)}</span>
        </button>
      </li>
    );
  }

  return (
    <li>
      <FormRenda renda={renda} contas={contas} onFechar={onFechar} />
    </li>
  );
}

function FormRenda({
  renda,
  contas,
  onFechar,
}: {
  renda: Renda;
  contas: readonly { id: string; apelido: string }[];
  onFechar: () => Promise<void>;
}) {
  const [valorNovo, setValorNovo] = useState(renda.valor);
  const recorrente = renda.periodicidade !== 'unica';
  const mudouOValor = valorNovo !== renda.valor;
  /**
   * A pergunta "a partir de quando?" so existe quando ha um valor ANTERIOR a
   * preservar. Numa entrada recem-criada nao ha passado nenhum, e exigir a
   * escolha ali fazia o valor digitado se perder no caminho.
   */
  const ehAumento = mudouOValor && recorrente && renda.valor > 0;

  async function mudar(mudancas: Partial<Omit<Renda, 'id'>>) {
    await atualizarRenda(renda.id, mudancas);
  }

  return (
    <div className="form-item">
      <div className="campo">
        <span className="campo-rotulo">Origem</span>
        <SeletorChips
          opcoes={ORIGENS_RENDA}
          valor={renda.origem}
          rotulo="Origem"
          permitirNovo
          onChange={(origem) => void mudar({ origem })}
        />
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={'valor-' + renda.id}>Valor</label>
        <CampoDinheiro id={'valor-' + renda.id} valor={valorNovo} onChange={setValorNovo} />
      </div>

      {ehAumento && (
        <div className="cartao">
          <p style={{ marginTop: 0 }}>
            De {formatarReais(renda.valor)} para {formatarReais(valorNovo)}. A partir de quando?
          </p>
          <div className="acoes" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="botao botao-primario botao-largo"
              onClick={async () => {
                await alterarRendaRecorrente(renda.id, valorNovo, Date.now());
                await onFechar();
              }}
            >
              Mudou a partir deste mês
            </button>
            <button
              type="button"
              className="botao botao-largo"
              onClick={async () => {
                await corrigirRenda(renda.id, valorNovo);
                await onFechar();
              }}
            >
              Corrigir desde sempre
            </button>
          </div>
          <p className="dica">
            "Mudou a partir deste mês" mantém os meses anteriores com o valor antigo — é o que
            preserva o histórico. "Corrigir desde sempre" é para erro de digitação.
          </p>
        </div>
      )}

      {mudouOValor && !ehAumento && (
        <button
          type="button"
          className="botao botao-primario botao-largo"
          onClick={() => void mudar({ valor: valorNovo })}
        >
          Salvar {formatarReais(valorNovo)}
        </button>
      )}

      <div className="campo">
        <label className="campo-rotulo" htmlFor={'per-' + renda.id}>Com que frequência</label>
        <select
          id={'per-' + renda.id}
          className="entrada"
          value={renda.periodicidade}
          onChange={(e) => void mudar({ periodicidade: e.target.value as Periodicidade })}
        >
          {PERIODICIDADES.map((p) => (
            <option key={p.valor} value={p.valor}>{p.rotulo}</option>
          ))}
        </select>
        {renda.periodicidade === 'anual' && (
          <p className="dica">
            É assim que 13º e férias entram na previsão. Sem eles, uma projeção de doze meses
            no Brasil está errada por construção.
          </p>
        )}
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={'data-' + renda.id}>
          {recorrente ? 'Primeira vez (e o dia do mês)' : 'Quando caiu'}
        </label>
        <input
          id={'data-' + renda.id}
          className="entrada"
          type="datetime-local"
          value={paraInputDataHora(renda.data)}
          onChange={(e) => {
            const data = deInputDataHora(e.target.value);
            if (data !== null) void mudar({ data });
          }}
        />
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={'conta-' + renda.id}>Cai em</label>
        <select
          id={'conta-' + renda.id}
          className="entrada"
          value={renda.contaId ?? ''}
          onChange={(e) => void mudar({ contaId: e.target.value || null })}
        >
          <option value="">Conta corrente (o padrão)</option>
          {contas.map((conta) => (
            <option key={conta.id} value={conta.id}>{conta.apelido}</option>
          ))}
        </select>
        <p className="dica">
          Recarga de vale alimentação entra aqui apontando para o vale: o dinheiro fica lá, não
          na conta.
        </p>
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={'desc-' + renda.id}>Descrição (opcional)</label>
        <input
          id={'desc-' + renda.id}
          className="entrada"
          type="text"
          autoComplete="off"
          value={renda.descricao}
          onChange={(e) => void mudar({ descricao: e.target.value })}
        />
      </div>

      <div className="form-item-rodape">
        <button
          type="button"
          className="botao botao-perigo"
          onClick={async () => {
            if (window.confirm('Excluir esta entrada?')) {
              await excluirRenda(renda.id);
              await onFechar();
            }
          }}
        >
          Excluir
        </button>
        <button type="button" className="botao botao-primario" onClick={() => void onFechar()}>
          Pronto
        </button>
      </div>

      {recorrente && (
        <p className="dica">
          Já contou {ocorrenciasDeRenda(renda, Date.now()).length} vez(es) até hoje.
        </p>
      )}
    </div>
  );
}
