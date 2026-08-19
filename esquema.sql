-- Esquema do Postgres. Aplique com: npm run banco:criar
--
-- Duas escolhas aqui merecem explicacao:
--
-- 1. `versao` vem de uma SEQUENCE, nao de um relogio.
--    E o cursor da sincronizacao. Se fosse horario, o relogio errado de um
--    aparelho faria o cliente pular registros em silencio — a sincronizacao
--    pareceria funcionar e deixaria compras para tras. Uma sequence e
--    estritamente crescente e nao depende de relogio nenhum.
--
-- 2. `itens.compra_id` NAO tem chave estrangeira.
--    Numa sincronizacao os registros chegam na ordem em que o aparelho os
--    enfileirou, e um item pode chegar antes da compra dele. Com FK, esse lote
--    seria rejeitado inteiro. A integridade e garantida por quem escreve, no
--    aparelho, onde item nenhum existe sem compra.

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

-- O indice que sustenta o pull: "tudo que mudou depois do cursor".
CREATE INDEX IF NOT EXISTS idx_compras_versao ON compras (versao);
CREATE INDEX IF NOT EXISTS idx_itens_versao   ON itens (versao);
CREATE INDEX IF NOT EXISTS idx_itens_compra   ON itens (compra_id);

-- Usado pelas dicas de IA, que leem um mes de cada vez.
CREATE INDEX IF NOT EXISTS idx_compras_data ON compras (data);
