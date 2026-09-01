-- Esquema do Postgres. Aplique com: npm run banco:criar
--
-- ATENCAO: depois de publicar a v2, este arquivo precisa ser aplicado DE NOVO
-- contra o Neon. As tabelas novas e as colunas novas de `compras` nao existem
-- la, e sem elas /api/sync passa a responder "relation does not exist" — o app
-- continua funcionando no aparelho, mas nada sobe. Tudo aqui e idempotente.
--
-- Tres escolhas aqui merecem explicacao:
--
-- 1. `versao` vem de uma SEQUENCE, nao de um relogio.
--    E o cursor da sincronizacao. Se fosse horario, o relogio errado de um
--    aparelho faria o cliente pular registros em silencio — a sincronizacao
--    pareceria funcionar e deixaria compras para tras. Uma sequence e
--    estritamente crescente e nao depende de relogio nenhum.
--
-- 2. NENHUMA tabela tem chave estrangeira.
--    Numa sincronizacao os registros chegam na ordem em que o aparelho os
--    enfileirou, e um item pode chegar antes da compra dele — ou um pagamento
--    antes da conta. Com FK, esse lote seria rejeitado inteiro. A integridade e
--    garantida por quem escreve, no aparelho, onde nada existe sem o dono.
--
-- 3. Dinheiro e BIGINT em centavos; tempo e BIGINT em milissegundos.
--    Ponto flutuante erra centavo ao somar, e converter timestamp de ida e volta
--    arredonda e pode bagunçar a ordem de uma sincronizacao.

CREATE SEQUENCE IF NOT EXISTS seq_versao;

CREATE TABLE IF NOT EXISTS compras (
  id              TEXT PRIMARY KEY,
  data            BIGINT  NOT NULL,
  descricao       TEXT    NOT NULL DEFAULT '',
  categoria       TEXT    NOT NULL DEFAULT '',
  forma_pagamento TEXT    NOT NULL DEFAULT '',
  observacao      TEXT    NOT NULL DEFAULT '',
  total_manual    BIGINT  NOT NULL DEFAULT 0,
  total           BIGINT  NOT NULL DEFAULT 0,
  qtd_itens       INTEGER NOT NULL DEFAULT 0,
  atualizado_em   BIGINT  NOT NULL,
  excluido_em     BIGINT,
  versao          BIGINT  NOT NULL
);

-- Acrescentadas na v2. Compra antiga fica com conta_id NULL (fora do saldo, e a
-- tela avisa) e parcelas = 1, que e o comportamento de sempre.
ALTER TABLE compras ADD COLUMN IF NOT EXISTS conta_id TEXT;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS parcelas INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS itens (
  id             TEXT   PRIMARY KEY,
  compra_id      TEXT   NOT NULL,
  nome           TEXT   NOT NULL DEFAULT '',
  quantidade     DOUBLE PRECISION NOT NULL DEFAULT 0,
  unidade        TEXT   NOT NULL DEFAULT 'un',
  preco_unitario BIGINT NOT NULL DEFAULT 0,
  total          BIGINT NOT NULL DEFAULT 0,
  ordem          INTEGER NOT NULL DEFAULT 0,
  atualizado_em  BIGINT NOT NULL,
  excluido_em    BIGINT,
  versao         BIGINT NOT NULL
);

-- Onde o dinheiro esta: conta corrente, cartao de credito, vale e espécie.
-- `dia_fechamento` e `dia_vencimento` so valem em tipo = 'credito';
-- `saldo_inicial` nao se aplica a ele.
CREATE TABLE IF NOT EXISTS contas (
  id               TEXT PRIMARY KEY,
  apelido          TEXT    NOT NULL DEFAULT '',
  tipo             TEXT    NOT NULL DEFAULT 'corrente',
  dia_fechamento   INTEGER NOT NULL DEFAULT 1,
  dia_vencimento   INTEGER NOT NULL DEFAULT 10,
  limite           BIGINT  NOT NULL DEFAULT 0,
  saldo_inicial    BIGINT  NOT NULL DEFAULT 0,
  saldo_inicial_em BIGINT  NOT NULL DEFAULT 0,
  ordem            INTEGER NOT NULL DEFAULT 0,
  atualizado_em    BIGINT  NOT NULL,
  excluido_em      BIGINT,
  versao           BIGINT  NOT NULL
);

-- `periodicidade` + `encerrado_em` sao o que permite aumento de salario sem
-- reescrever o passado: a renda antiga ganha fim, a nova ganha inicio.
CREATE TABLE IF NOT EXISTS rendas (
  id            TEXT PRIMARY KEY,
  data          BIGINT NOT NULL,
  descricao     TEXT   NOT NULL DEFAULT '',
  origem        TEXT   NOT NULL DEFAULT '',
  valor         BIGINT NOT NULL DEFAULT 0,
  periodicidade TEXT   NOT NULL DEFAULT 'unica',
  encerrado_em  BIGINT,
  conta_id      TEXT,
  atualizado_em BIGINT NOT NULL,
  excluido_em   BIGINT,
  versao        BIGINT NOT NULL
);

-- `valor_total` e o TOTAL A PAGAR, com juros ja dentro. O app nao calcula juros.
CREATE TABLE IF NOT EXISTS dividas (
  id            TEXT PRIMARY KEY,
  descricao     TEXT    NOT NULL DEFAULT '',
  tipo          TEXT    NOT NULL DEFAULT 'emprestimo',
  valor_total   BIGINT  NOT NULL DEFAULT 0,
  parcelas      INTEGER NOT NULL DEFAULT 1,
  primeira_em   BIGINT  NOT NULL,
  desconto_em_folha BOOLEAN NOT NULL DEFAULT FALSE,
  conta_id      TEXT,
  observacao    TEXT    NOT NULL DEFAULT '',
  atualizado_em BIGINT  NOT NULL,
  excluido_em   BIGINT,
  versao        BIGINT  NOT NULL
);

CREATE TABLE IF NOT EXISTS metas (
  id             TEXT PRIMARY KEY,
  descricao      TEXT    NOT NULL DEFAULT '',
  valor_alvo     BIGINT  NOT NULL DEFAULT 0,
  guardado       BIGINT  NOT NULL DEFAULT 0,
  reserva_mensal BIGINT  NOT NULL DEFAULT 0,
  prazo_em       BIGINT,
  ordem          INTEGER NOT NULL DEFAULT 0,
  atualizado_em  BIGINT  NOT NULL,
  excluido_em    BIGINT,
  versao         BIGINT  NOT NULL
);

-- Dinheiro mudando de bolso: pagar fatura, pagar parcela de divida, sacar ou
-- transferir. NUNCA e gasto novo — e `alvo` + `alvo_id` que tornam essa
-- distincao possivel, e sem eles pagar a fatura seria indistinguivel de gastar
-- de novo.
CREATE TABLE IF NOT EXISTS transferencias (
  id              TEXT PRIMARY KEY,
  origem_conta_id TEXT   NOT NULL DEFAULT '',
  alvo            TEXT   NOT NULL DEFAULT 'cartao',
  alvo_id         TEXT   NOT NULL DEFAULT '',
  competencia     TEXT   NOT NULL DEFAULT '',
  data            BIGINT NOT NULL,
  valor           BIGINT NOT NULL DEFAULT 0,
  observacao      TEXT   NOT NULL DEFAULT '',
  atualizado_em   BIGINT NOT NULL,
  excluido_em     BIGINT,
  versao          BIGINT NOT NULL
);

-- "Descricao contendo X e sempre da categoria Y." Sincroniza porque e intencao
-- do usuario; o que o app aprende sozinho e derivado e fica so no aparelho.
CREATE TABLE IF NOT EXISTS regras (
  id            TEXT PRIMARY KEY,
  termo         TEXT    NOT NULL DEFAULT '',
  categoria     TEXT    NOT NULL DEFAULT '',
  ordem         INTEGER NOT NULL DEFAULT 0,
  atualizado_em BIGINT  NOT NULL,
  excluido_em   BIGINT,
  versao        BIGINT  NOT NULL
);

-- Os indices que sustentam o pull: "tudo que mudou depois do cursor".
CREATE INDEX IF NOT EXISTS idx_compras_versao        ON compras (versao);
CREATE INDEX IF NOT EXISTS idx_itens_versao          ON itens (versao);
CREATE INDEX IF NOT EXISTS idx_contas_versao         ON contas (versao);
CREATE INDEX IF NOT EXISTS idx_rendas_versao         ON rendas (versao);
CREATE INDEX IF NOT EXISTS idx_dividas_versao        ON dividas (versao);
CREATE INDEX IF NOT EXISTS idx_metas_versao          ON metas (versao);
CREATE INDEX IF NOT EXISTS idx_transferencias_versao ON transferencias (versao);
CREATE INDEX IF NOT EXISTS idx_regras_versao         ON regras (versao);

CREATE INDEX IF NOT EXISTS idx_itens_compra ON itens (compra_id);

-- Usado pelas dicas de IA, que leem um mes de cada vez.
CREATE INDEX IF NOT EXISTS idx_compras_data ON compras (data);

-- Usado ao montar as faturas e o "quanto falta".
CREATE INDEX IF NOT EXISTS idx_transferencias_alvo ON transferencias (alvo, alvo_id);
