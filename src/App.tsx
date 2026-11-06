/**
 * O esqueleto: rotas e a porteira da sessao.
 *
 * As rotas sao por HASH (#/compra/abc) de proposito. Assim o servidor so ve
 * "/" e nunca precisa de configuracao para reescrever caminho — o que evita a
 * classe inteira de bug em que recarregar a pagina dentro do app devolve 404.
 */

import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EditarCompra } from './paginas/EditarCompra';
import { Entrar } from './paginas/Entrar';
import { Inicio } from './paginas/Inicio';
import { ListaCompras } from './paginas/ListaCompras';
import { AnunciaRota } from './componentes/AnunciaRota';
import { ProvedorDeConfirmacao } from './componentes/Confirmar';
import { ProvedorDeDesfazer } from './componentes/Desfazer';
import { Carregando } from './componentes/Carregando';
import { NovaVersao } from './componentes/NovaVersao';
import { ProvedorApp, useApp } from './estado';

// Pacote proprio por tela (`React.lazy`). Cada `import()` vira um arquivo que so
// baixa quando a rota abre. As telas de todo dia — Inicio, lista de compras e a
// compra — ficam no pacote principal, acima.
const Ajustes = lazy(() => import('./paginas/Ajustes').then((m) => ({ default: m.Ajustes })));
const Carteira = lazy(() => import('./paginas/Carteira').then((m) => ({ default: m.Carteira })));
const Contas = lazy(() => import('./paginas/Contas').then((m) => ({ default: m.Contas })));
const Dividas = lazy(() => import('./paginas/Dividas').then((m) => ({ default: m.Dividas })));
const EditarReceita = lazy(() => import('./paginas/EditarReceita').then((m) => ({ default: m.EditarReceita })));
const Fatura = lazy(() => import('./paginas/Fatura').then((m) => ({ default: m.Fatura })));
const Metas = lazy(() => import('./paginas/Metas').then((m) => ({ default: m.Metas })));
const Orcamento = lazy(() => import('./paginas/Orcamento').then((m) => ({ default: m.Orcamento })));
const Parcela = lazy(() => import('./paginas/Parcela').then((m) => ({ default: m.Parcela })));
const Receitas = lazy(() => import('./paginas/Receitas').then((m) => ({ default: m.Receitas })));
const Resumo = lazy(() => import('./paginas/Resumo').then((m) => ({ default: m.Resumo })));
const Simular = lazy(() => import('./paginas/Simular').then((m) => ({ default: m.Simular })));
const Transferencias = lazy(() => import('./paginas/Transferencias').then((m) => ({ default: m.Transferencias })));


function Conteudo() {
  const { acesso } = useApp();

  if (acesso === 'verificando') {
    return (
      <div className="app">
        <p className="carregando">Abrindo…</p>
      </div>
    );
  }

  if (acesso === 'bloqueado') return <Entrar />;

  return (
    <Suspense fallback={<div className="app" role="main"><Carregando /></div>}>
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/compras" element={<ListaCompras />} />
      <Route path="/receitas" element={<Receitas />} />
      <Route path="/receita/:id" element={<EditarReceita />} />
      <Route path="/compra/:id" element={<EditarCompra />} />
      <Route path="/resumo" element={<Resumo />} />
      <Route path="/ajustes" element={<Ajustes />} />
      {/* O lado financeiro. As rotas existem sempre; o que decide se alguem
          chega ate elas e haver dado que as sustente — nenhum icone leva a
          Carteira antes da primeira conta ou entrada. */}
      <Route path="/carteira" element={<Carteira />} />
      <Route path="/simular" element={<Simular />} />
      <Route path="/contas" element={<Contas />} />
      {/* A tela de "Entradas" (a regra recorrente) foi absorvida por Receitas. O
          redirecionamento existe para link antigo e PWA em cache nao cairem num 404. */}
      <Route path="/rendas" element={<Navigate to="/receitas" replace />} />
      <Route path="/dividas" element={<Dividas />} />
      <Route path="/transferencias" element={<Transferencias />} />
      <Route path="/metas" element={<Metas />} />
      <Route path="/orcamento" element={<Orcamento />} />
      <Route path="/fatura/:contaId/:competencia" element={<Fatura />} />
      <Route path="/parcela/:dividaId/:competencia" element={<Parcela />} />
      <Route path="*" element={<Inicio />} />
    </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <HashRouter>
      <ProvedorApp>
        <ProvedorDeConfirmacao>
          <ProvedorDeDesfazer>
            <AnunciaRota />
            <Conteudo />
            <NovaVersao />
          </ProvedorDeDesfazer>
        </ProvedorDeConfirmacao>
      </ProvedorApp>
    </HashRouter>
  );
}
