# webapp-compras

Registro pessoal de compras. **Local-first**: escreve no IndexedDB do aparelho e
sincroniza com Postgres na nuvem quando ha internet. Funciona sem sinal.

**Contexto completo, decisões e pendências:**
`C:/Users/Andresson Dias/Documents/Obsidian Vault/Projetos/webapp-compras/`
Leia antes de mudanças estruturais; registre decisões novas lá ao encerrar.

## Stack

React 19 + TypeScript + Vite 8 · Dexie 4 (IndexedDB) · `react-router-dom` 7
(rota por **hash**) · `vite-plugin-pwa` · `write-excel-file`.
Servidor: Hono sobre Node · `@neondatabase/serverless` · `@anthropic-ai/sdk`.
Hospedagem: servidor no **Render**, banco no **Neon** (o Postgres do Render
expira em 30 dias — nunca use ele). Sem ESLint/Prettier.

## Comandos

```bash
npm run dev        # Vite + API juntos
npm run build      # typecheck dos dois lados + build do app e do servidor
npm run teste:sync # teste de sincronização contra Postgres em memória
npm start          # o que o Render executa
npm run segredo    # gera o SESSAO_SEGREDO
```

`npm run build` e `npm run teste:sync` são as únicas verificações automáticas.
Rode as duas antes de dar qualquer mudança por concluída.

## Invariantes — quebrar qualquer uma destas é bug

1. **Dinheiro é inteiro em centavos, sempre.** Nunca float. A conversão para
   texto pt-BR vive só em `src/lib/dinheiro.ts`.
2. **Tempo é inteiro em milissegundos** (`Date.now()`), nunca `Date` serializado.
3. **O `total` do item é digitável e soberano.** Ele é o valor do cupom. O
   `precoUnitario` é histórico e **nunca** recalcula dinheiro: 1,235 kg ×
   R$ 14,99 dá R$ 18,51, mas a balança cobra R$ 18,52.
4. **O autopreenchimento preenche campo vazio e nunca sobrescreve o digitado.**
   Sobrescrever corromperia o preço de prateleira no histórico.
5. **Nenhum componente fala com o Dexie.** Todo acesso passa por
   `src/dados/compras.ts`, que é quem carimba `atualizadoEm` e `pendente = 1`.
   Escrita fora dali não sobe para a nuvem, e o sintoma só aparece semanas
   depois.
6. **Nada é apagado de verdade.** Excluir carimba `excluidoEm`; toda consulta
   ignora quem está na lápide.
7. **`pendente` é 0/1, não booleano nem `null`.** O IndexedDB não indexa
   booleano nem nulo — a fila de envio ficaria invisível.
8. **`/api/*` responde sempre JSON, nunca HTML.** O cliente trata resposta
   não-JSON como sessão expirada; um 404 em HTML mandaria você fazer login.

## Convenções

- Identificadores, arquivos e comentários em **português**.
- Comentário de bloco no topo do arquivo explicando **por que** ele existe, não
  o que faz. Siga o tom de `src/dados/compras.ts` e `compartilhado/tipos.ts`.
- Aspas simples, ponto e vírgula, indentação de 2 espaços.

## Cuidados

- **O driver do Neon é o HTTP, não um pool.** Conexão ociosa impede o banco de
  suspender e queima as 100 horas de compute do plano gratuito em silêncio.
- **`tsx watch` não sobe sob o `concurrently` no Windows** — por isso `npm run
  dev` usa `tsx` puro. Para auto-reload do servidor, rode `npm run dev:api`
  separado.
- **Sem `DATABASE_URL`, o servidor sobe com Postgres local** (PGlite em
  `.dados/`) e **sem senha**. Isso só vale em desenvolvimento: havendo
  `DATABASE_URL`, ele se recusa a subir sem `SENHA_HASH`.
- Falha de rede **não** tranca o app. A tela de senha só aparece quando o
  servidor diz explicitamente que não há sessão. Ver `src/estado.tsx`.
- Nenhum segredo no repositório nem no cofre — só onde ele mora.
