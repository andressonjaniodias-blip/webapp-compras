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

const FUNDO = '#0f1720';
const CLARO = '#4ade80';

function svg(margem: number): string {
  const escala = (128 - margem) / 128;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="${margem > 20 ? 0 : 56}" fill="${FUNDO}"/>
  <g transform="translate(128 128) scale(${escala}) translate(-128 -128)">
    <path d="M64 80h20l18 88h84l18-62H96" fill="none" stroke="${CLARO}"
          stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="110" cy="196" r="12" fill="${CLARO}"/>
    <circle cx="176" cy="196" r="12" fill="${CLARO}"/>
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
