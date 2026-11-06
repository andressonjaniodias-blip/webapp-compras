/**
 * Gera os PNGs do PWA a partir de um SVG escrito aqui mesmo.
 *
 * Ficar num script, e nao em arquivos binarios versionados, mantem o icone
 * editavel: mudar a cor e uma linha de texto, nao abrir editor de imagem.
 *
 * O icone "maskable" tem margem folgada de proposito: o Android recorta o icone
 * num formato que varia por aparelho, e desenho colado na borda sai cortado.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// As cores do tema escuro do app (`--fundo`, `--acento`) e o concreto do claro
// (`--fundo`), que faz a sombra dura. O visual e brutalista: quina viva, nada de
// raio nem degrade, e uma sombra deslocada que nao esmaece.
const FUNDO = '#0a0a0a';
const VERDE = '#2bd96b';
const CONCRETO = '#d6d6d2';

function svg(margem: number): string {
  const escala = (128 - margem) / 128;
  const carrinho = (cor: string) => `<path d="M64 80h20l18 88h84l18-62H96" fill="none" stroke="${cor}"
          stroke-width="20" stroke-linecap="square" stroke-linejoin="miter"/>
    <rect x="96" y="184" width="26" height="26" fill="${cor}"/>
    <rect x="164" y="184" width="26" height="26" fill="${cor}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="${FUNDO}"/>
  <g transform="translate(128 128) scale(${escala}) translate(-128 -128)">
    <g transform="translate(9 9)">${carrinho(CONCRETO)}</g>
    ${carrinho(VERDE)}
  </g>
</svg>`;
}

await mkdir('public', { recursive: true });

const saidas: [string, number, number][] = [
  ['public/icone-192.png', 192, 12],
  ['public/icone-512.png', 512, 12],
  ['public/icone-maskable.png', 512, 44],
];

for (const [caminho, tamanho, margem] of saidas) {
  await sharp(Buffer.from(svg(margem))).resize(tamanho, tamanho).png().toFile(caminho);
  console.log('gerado ' + caminho);
}

await writeFile('public/icone.svg', svg(12), 'utf8');
console.log('gerado public/icone.svg');
