// scripts/generate-placeholder-images.js
// Genera imágenes SVG de ejemplo (señales/escenas simplificadas) para poder
// probar la aplicación sin depender de un banco de imágenes real.
// Estas imágenes NO son señales oficiales DGT: son placeholders genéricos
// pensados solo para desarrollo/demo.

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'public', 'images', 'preguntas');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Definición de placeholders: id -> { tipo, color, texto }
const placeholders = [
  { id: 'ph-triangulo-1',  tipo: 'triangulo', color: '#e63946', texto: 'CURVA' },
  { id: 'ph-triangulo-2',  tipo: 'triangulo', color: '#e63946', texto: 'STOP' },
  { id: 'ph-circulo-1',    tipo: 'circulo',   color: '#1d3557', texto: '90' },
  { id: 'ph-circulo-2',    tipo: 'circulo',   color: '#1d3557', texto: 'PROHIBIDO' },
  { id: 'ph-cuadrado-1',   tipo: 'cuadrado',  color: '#2a9d8f', texto: 'AUTOVÍA' },
  { id: 'ph-cuadrado-2',   tipo: 'cuadrado',  color: '#2a9d8f', texto: 'P' },
  { id: 'ph-escena-1',     tipo: 'escena',    color: '#457b9d', texto: 'CRUCE' },
  { id: 'ph-escena-2',     tipo: 'escena',    color: '#457b9d', texto: 'GLORIETA' },
  { id: 'ph-escena-3',     tipo: 'escena',    color: '#6d597a', texto: 'AUTOPISTA' },
  { id: 'ph-escena-4',     tipo: 'escena',    color: '#6d597a', texto: 'NIEBLA' },
];

function svgFor(p) {
  const w = 500, h = 350;
  let shape = '';
  switch (p.tipo) {
    case 'triangulo':
      shape = `<polygon points="250,40 460,300 40,300" fill="white" stroke="${p.color}" stroke-width="18"/>`;
      break;
    case 'circulo':
      shape = `<circle cx="250" cy="170" r="140" fill="white" stroke="${p.color}" stroke-width="18"/>`;
      break;
    case 'cuadrado':
      shape = `<rect x="90" y="40" width="320" height="260" rx="12" fill="${p.color}" />`;
      break;
    default:
      shape = `<rect x="20" y="20" width="460" height="310" rx="16" fill="${p.color}" opacity="0.15" stroke="${p.color}" stroke-width="4"/>`;
  }
  const textColor = p.tipo === 'cuadrado' ? 'white' : p.color;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#f1f1f1"/>
  ${shape}
  <text x="50%" y="${p.tipo === 'escena' ? '90%' : '55%'}" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="${textColor}">${p.texto}</text>
  <text x="50%" y="97%" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#999">Imagen de ejemplo (placeholder)</text>
</svg>`;
}

for (const p of placeholders) {
  const file = path.join(OUT_DIR, `${p.id}.svg`);
  fs.writeFileSync(file, svgFor(p), 'utf-8');
}

console.log(`✅ ${placeholders.length} imágenes placeholder generadas en ${OUT_DIR}`);
