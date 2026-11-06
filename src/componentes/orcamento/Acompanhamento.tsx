/**
 * O acompanhamento do orcamento confirmado, em duas visoes (Mes e Ano).
 *
 * Saiu de `paginas/Orcamento.tsx`, que tinha quase 900 linhas misturando o fluxo
 * (gerar, ajustar, confirmar) com o desenho do acompanhamento. Aqui so se desenha: o
 * fluxo e o estado ficam na pagina, e todo numero vem de `compartilhado/orcamento.ts`.
 */

import { NavegadorDeMes } from '../NavegadorDeMes';
import { BarraDeProgresso } from '../graficos/BarraDeProgresso';
import { SeloDeEstado } from '../graficos/Estado';
import {
  executar,
  executarMes,
  type EstadoDoLimite,
} from '../../../compartilhado/orcamento';
import type { LinhaOrcamento } from '../../../compartilhado/tipos';
import { apenasMes } from '../../lib/datas';
import { formatarReais } from '../../lib/dinheiro';
import { contagem } from '../../lib/texto';

/**
 * O acompanhamento: DUAS visoes do mesmo teto, separadas.
 *
 *   Mes  -> o limite deste mes (a media do teto, ajustada pelo que ja foi gasto) contra o gasto do mes
 *   Ano  -> o teto do ano contra o gasto do ano
 *
 * Cada visao agrupa em macrocategorias, que so organizam a exibicao: o teto
 * continua sendo de cada subcategoria. Todo numero vem de `executarMes` e
 * `executar`; aqui so se desenha.
 *
 * As macrocategorias que CABEM ficam recolhidas (so o nome, o total e o estado) e as
 * que apertam ou estouram abrem sozinhas: com ~20 subcategorias, mostrar tudo
 * escondia justamente o que pede atencao.
 */
export function Acompanhamento({
  orc,
  mes,
  mesesDoAno,
  onMes,
  compras,
  agora,
  visao,
  onVisao,
}: {
  orc: { ano: number; linhas: LinhaOrcamento[] };
  mes: string;
  mesesDoAno: string[];
  onMes: (mes: string) => void;
  compras: Parameters<typeof executar>[0];
  agora: number;
  visao: 'mes' | 'ano';
  onVisao: (visao: 'mes' | 'ano') => void;
}) {
  return (
    <>
      <h2 className="secao-titulo">Acompanhamento</h2>
      <div className="acoes-linha" role="group" aria-label="Período do acompanhamento">
        {(['mes', 'ano'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={'botao' + (v === visao ? ' botao-primario' : '')}
            aria-pressed={v === visao}
            onClick={() => onVisao(v)}
          >
            {v === 'mes' ? 'Mês' : 'Ano'}
          </button>
        ))}
      </div>

      {visao === 'mes' ? (
        <VisaoMensal
          orc={orc}
          mes={mes}
          mesesDoAno={mesesDoAno}
          onMes={onMes}
          compras={compras}
          agora={agora}
        />
      ) : (
        <VisaoAnual orc={orc} mes={mes} compras={compras} agora={agora} />
      )}
    </>
  );
}

/** "sobe R$ 45,45 por você ter gasto menos antes": quanto o gasto anterior mexeu no limite. */
function textoDoAjuste(ajuste: number): string | null {
  if (ajuste === 0) return null;
  return ajuste > 0
    ? `sobe ${formatarReais(ajuste)} por você ter gasto menos antes`
    : `desce ${formatarReais(-ajuste)} por você ter gasto mais antes`;
}

/** A razao entre o gasto e o limite, de 0 a 1 (com limite 0, gastar qualquer coisa e "cheio"). */
const razao = (gasto: number, limite: number) => (limite > 0 ? gasto / limite : gasto > 0 ? 1 : 0);

/** O cabecalho recolhivel de uma macrocategoria: nome, total e estado. */
function CabecalhoDeMacro({
  nome,
  resumo,
  estado,
}: {
  nome: string;
  resumo: string;
  estado: EstadoDoLimite;
}) {
  return (
    <summary>
      <span>
        {nome} <span className="dica">{resumo}</span>
      </span>
      <SeloDeEstado estado={estado} />
    </summary>
  );
}

function VisaoMensal({
  orc,
  mes,
  mesesDoAno,
  onMes,
  compras,
  agora,
}: {
  orc: { ano: number; linhas: LinhaOrcamento[] };
  mes: string;
  mesesDoAno: string[];
  onMes: (mes: string) => void;
  compras: Parameters<typeof executar>[0];
  agora: number;
}) {
  const exec = executarMes(compras, orc, mes, agora);

  return (
    <>
      <NavegadorDeMes meses={mesesDoAno} mes={mes} onChange={onMes} />

      <section className="cartao">
        <div className="linha-entre">
          <span className="dica">gasto em {apenasMes(mes)}</span>
          <SeloDeEstado estado={exec.estado} />
        </div>
        <div className="total-grande">{formatarReais(exec.gasto)}</div>
        <BarraDeProgresso
          progresso={razao(exec.gasto, exec.limite)}
          rotulo={`${formatarReais(exec.gasto)} gastos de um limite de ${formatarReais(exec.limite)} em ${apenasMes(mes)}`}
        />
        <p className="texto">
          de {formatarReais(exec.limite)} de limite do mês ·{' '}
          {exec.estourou > 0
            ? `passou ${formatarReais(exec.estourou)}`
            : `restam ${formatarReais(exec.restante)}`}
        </p>
        <p className="dica">
          O limite do mês é a média do teto anual, ajustada pelo que você já gastou no ano.
        </p>
      </section>

      {exec.macros.map((bloco) => (
        <details key={bloco.macro + bloco.estado} className="macro" open={bloco.estado !== 'cabe'}>
          <CabecalhoDeMacro
            nome={bloco.macro}
            resumo={`${formatarReais(bloco.gasto)} de ${formatarReais(bloco.limite)}`}
            estado={bloco.estado}
          />
          <ul className="lista">
            {bloco.linhas.map((l) => {
              const ajuste = textoDoAjuste(l.ajuste);
              return (
                <li key={l.categoria} className="cartao">
                  <div className="linha-entre">
                    <strong>{l.categoria}</strong>
                    <SeloDeEstado estado={l.estado} />
                  </div>
                  <p className="texto">
                    {formatarReais(l.gastoNoMes)} de {formatarReais(l.limiteDoMes)}
                  </p>
                  <BarraDeProgresso
                    progresso={razao(l.gastoNoMes, l.limiteDoMes)}
                    rotulo={`${l.categoria}: ${formatarReais(l.gastoNoMes)} de ${formatarReais(l.limiteDoMes)}`}
                  />
                  <p className="dica">
                    {l.estourou > 0
                      ? `passou ${formatarReais(l.estourou)} do limite · `
                      : `restam ${formatarReais(l.restanteDoMes)} · `}
                    média de {formatarReais(l.media)}
                    {ajuste && ` · o limite ${ajuste}`}
                  </p>
                </li>
              );
            })}
          </ul>
        </details>
      ))}

      {exec.fora.length > 0 && (
        <div className="cartao">
          <strong>Fora do orçamento</strong>
          <p className="dica">Categorias com gasto em {apenasMes(mes)} e sem teto.</p>
          <ul className="lista-limpa">
            {exec.fora.map((f) => (
              <li key={f.categoria}>
                {f.categoria} · {formatarReais(f.gastoNoMes)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function VisaoAnual({
  orc,
  mes,
  compras,
  agora,
}: {
  orc: { ano: number; linhas: LinhaOrcamento[] };
  mes: string;
  compras: Parameters<typeof executar>[0];
  agora: number;
}) {
  const exec = executar(compras, orc, mes, agora);

  return (
    <>
      <section className="cartao topo-12">
        <span className="dica">gasto no ano, nas categorias com teto</span>
        <div className="total-grande">{formatarReais(exec.gastoNoAno)}</div>
        <BarraDeProgresso
          progresso={razao(exec.gastoNoAno, exec.totalDosTetos)}
          rotulo={`${formatarReais(exec.gastoNoAno)} gastos de ${formatarReais(exec.totalDosTetos)} em tetos`}
        />
        <p className="texto">
          de {formatarReais(exec.totalDosTetos)} em tetos · ainda cabem {formatarReais(exec.restante)}
          {exec.mesesQueFaltam > 0 && ` em ${contagem(exec.mesesQueFaltam, 'mês', 'meses')}`}
        </p>
      </section>

      {exec.macros.map((bloco) => (
        <details key={bloco.macro + bloco.estado} className="macro" open={bloco.estado !== 'cabe'}>
          <CabecalhoDeMacro
            nome={bloco.macro}
            resumo={`${formatarReais(bloco.gastoNoAno)} de ${formatarReais(bloco.teto)} no ano`}
            estado={bloco.estado}
          />
          <ul className="lista">
            {bloco.linhas.map((l) => (
              <li key={l.categoria} className="cartao">
                <div className="linha-entre">
                  <strong>{l.categoria}</strong>
                  <SeloDeEstado estado={l.estado} />
                </div>
                <p className="texto">
                  {formatarReais(l.gastoNoAno)} de {formatarReais(l.teto)}
                  {l.ajustadoDe !== null && ` · ajustado de ${formatarReais(l.ajustadoDe)}`}
                </p>
                <BarraDeProgresso
                  progresso={razao(l.gastoNoAno, l.teto)}
                  rotulo={`${l.categoria}: ${formatarReais(l.gastoNoAno)} de ${formatarReais(l.teto)}`}
                />
                <p className="dica">
                  {l.estado === 'estoura'
                    ? `passou ${formatarReais(l.estourou)} do teto`
                    : `restam ${formatarReais(l.restante)} no ano`}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ))}

      {exec.fora.length > 0 && (
        <div className="cartao">
          <strong>Fora do orçamento</strong>
          <p className="dica">Categorias com gasto no ano e sem teto.</p>
          <ul className="lista-limpa">
            {exec.fora.map((f) => (
              <li key={f.categoria}>
                {f.categoria} · {formatarReais(f.gastoNoAno)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
