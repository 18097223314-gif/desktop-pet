#!/usr/bin/env node
/**
 * 爪爪桌宠 — SVG 精灵图生成器
 * 纯 Node.js 生成 SVG 精灵图 + 数据 URI + meta.json
 * 输出：assets/characters/cat/*.svg + assets/characters/cat/meta.json
 *       assets/characters/cat/sprite-data.js（数据 URI，供前端直接引用）
 */

const fs = require('fs');
const path = require('path');

// ============ SVG 猫咪帧绘制 ============

function svgCatFrame(frameType, frameIdx, totalFrames) {
  const t = totalFrames > 1 ? frameIdx / Math.max(1, totalFrames - 1) : 0;

  // Animation offsets
  let bobY = 0, walkOff = 0, tailWag = 0;
  let eyeOpen = 1, legStyle = 'stand', headTilt = 0;
  let showZzz = false;

  switch (frameType) {
    case 'idle':
      bobY = Math.sin(t * Math.PI * 2) * 1.5;
      tailWag = Math.sin(t * Math.PI * 2 + 1) * 3;
      eyeOpen = 1 - Math.sin(t * Math.PI * 2) * 0.1;
      break;
    case 'walk':
      walkOff = Math.sin(t * Math.PI * 2) * 3;
      bobY = Math.abs(Math.sin(t * Math.PI * 2)) * 2;
      tailWag = Math.sin(t * Math.PI * 4) * 5;
      legStyle = 'walk';
      break;
    case 'sit':
      legStyle = 'sit';
      bobY = Math.sin(t * Math.PI) * 0.5;
      headTilt = t * 2 - 1;
      break;
    case 'sleep':
      eyeOpen = 0;
      showZzz = true;
      bobY = Math.sin(t * Math.PI * 1.5) * 1;
      tailWag = -2;
      break;
    case 'dragged':
      legStyle = 'drag';
      tailWag = Math.sin(t * Math.PI * 2) * 4;
      headTilt = Math.sin(t * Math.PI * 2) * 5;
      break;
  }

  const cx = 32, cy = 32;
  const baseY = cy + bobY + 4;
  const headY = baseY - 10;

  // Colors
  const c = {
    body: '#c8b4a0', bodyLight: '#dcbcac', earInner: '#e6aaaa',
    nose: '#dc8282', eye: '#3c3228', eyeHi: '#ffffff',
    mouth: '#b47878', whisker: 'rgba(100,90,80,0.7)',
    tail: '#beaac6', paw: '#d2c3af', blush: 'rgba(255,180,180,0.5)',
    outline: '#50463c', zzz: '#9999cc'
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">`;

  // Tail
  const twx = tailWag;
  svg += `<path d="M${cx+10},${baseY-2} Q${cx+18+twx},${baseY-12} ${cx+20+twx*0.8},${baseY-18}"
            stroke="${c.tail}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;

  // Body
  svg += `<ellipse cx="${cx}" cy="${baseY}" rx="12" ry="10" fill="${c.body}"/>`;
  svg += `<ellipse cx="${cx}" cy="${baseY+2}" rx="7" ry="6" fill="${c.bodyLight}"/>`;

  // Legs
  if (legStyle === 'sit') {
    svg += `<ellipse cx="${cx-7}" cy="${baseY+6}" rx="4" ry="3" fill="${c.body}"/>`;
    svg += `<ellipse cx="${cx+7}" cy="${baseY+6}" rx="4" ry="3" fill="${c.body}"/>`;
    svg += `<circle cx="${cx-7}" cy="${baseY+7}" r="2.5" fill="${c.paw}"/>`;
    svg += `<circle cx="${cx+7}" cy="${baseY+7}" r="2.5" fill="${c.paw}"/>`;
  } else if (legStyle === 'walk') {
    const lo1 = walkOff, lo2 = -walkOff;
    svg += `<rect x="${cx-8+lo1*0.5}" y="${baseY+4}" width="4" height="7" rx="2" fill="${c.body}" transform="rotate(${lo1*3},${cx-6},${baseY+4})"/>`;
    svg += `<rect x="${cx+4+lo2*0.5}" y="${baseY+4}" width="4" height="7" rx="2" fill="${c.body}" transform="rotate(${lo2*3},${cx+6},${baseY+4})"/>`;
    svg += `<circle cx="${cx-6+lo1*0.5}" cy="${baseY+12}" r="2.5" fill="${c.paw}"/>`;
    svg += `<circle cx="${cx+6+lo2*0.5}" cy="${baseY+12}" r="2.5" fill="${c.paw}"/>`;
  } else if (legStyle === 'drag') {
    svg += `<rect x="${cx-10}" y="${baseY+4}" width="4" height="7" rx="2" fill="${c.body}" transform="rotate(-15,${cx-8},${baseY+4})"/>`;
    svg += `<rect x="${cx+6}" y="${baseY+4}" width="4" height="7" rx="2" fill="${c.body}" transform="rotate(15,${cx+8},${baseY+4})"/>`;
    svg += `<circle cx="${cx-9}" cy="${baseY+11}" r="2.5" fill="${c.paw}"/>`;
    svg += `<circle cx="${cx+9}" cy="${baseY+11}" r="2.5" fill="${c.paw}"/>`;
  } else {
    // stand
    svg += `<rect x="${cx-7}" y="${baseY+5}" width="4" height="7" rx="2" fill="${c.body}"/>`;
    svg += `<rect x="${cx+3}" y="${baseY+5}" width="4" height="7" rx="2" fill="${c.body}"/>`;
    svg += `<circle cx="${cx-5}" cy="${baseY+12}" r="2.5" fill="${c.paw}"/>`;
    svg += `<circle cx="${cx+5}" cy="${baseY+12}" r="2.5" fill="${c.paw}"/>`;
  }

  // Head (with slight tilt for sit/drag)
  const tilt = headTilt;
  svg += `<g transform="rotate(${tilt}, ${cx}, ${headY})">`;

  // Ears
  svg += `<polygon points="${cx-9},${headY-7} ${cx-13},${headY-18} ${cx-5},${headY-10}" fill="${c.body}"/>`;
  svg += `<polygon points="${cx-9},${headY-8} ${cx-11},${headY-15} ${cx-7},${headY-9}" fill="${c.earInner}"/>`;
  svg += `<polygon points="${cx+9},${headY-7} ${cx+13},${headY-18} ${cx+5},${headY-10}" fill="${c.body}"/>`;
  svg += `<polygon points="${cx+9},${headY-8} ${cx+11},${headY-15} ${cx+7},${headY-9}" fill="${c.earInner}"/>`;

  // Head circle
  svg += `<ellipse cx="${cx}" cy="${headY}" rx="11" ry="10" fill="${c.body}"/>`;

  // Eyes
  if (eyeOpen < 0.3) {
    // Closed eyes (sleep): curved lines
    svg += `<path d="M${cx-6},${headY} Q${cx-4},${headY+2} ${cx-2},${headY}" stroke="${c.eye}" stroke-width="1.5" fill="none"/>`;
    svg += `<path d="M${cx+2},${headY} Q${cx+4},${headY+2} ${cx+6},${headY}" stroke="${c.eye}" stroke-width="1.5" fill="none"/>`;
  } else {
    // Open eyes
    const eH = 2.5 * eyeOpen;
    svg += `<ellipse cx="${cx-4}" cy="${headY-1}" rx="2.2" ry="${eH}" fill="${c.eye}"/>`;
    svg += `<ellipse cx="${cx+4}" cy="${headY-1}" rx="2.2" ry="${eH}" fill="${c.eye}"/>`;
    // Highlights
    svg += `<circle cx="${cx-3.5}" cy="${headY-1.5}" r="0.8" fill="${c.eyeHi}"/>`;
    svg += `<circle cx="${cx+4.5}" cy="${headY-1.5}" r="0.8" fill="${c.eyeHi}"/>`;
  }

  // Nose
  svg += `<circle cx="${cx}" cy="${headY+2}" r="1.2" fill="${c.nose}"/>`;

  // Mouth (w shape)
  svg += `<path d="M${cx-2},${headY+5} Q${cx},${headY+3.5} ${cx+2},${headY+5}"
            stroke="${c.mouth}" stroke-width="1" fill="none"/>`;

  // Whiskers
  svg += `<line x1="${cx-13}" y1="${headY+1}" x2="${cx-3}" y2="${headY+2}" stroke="${c.whisker}" stroke-width="0.6"/>`;
  svg += `<line x1="${cx-13}" y1="${headY+3}" x2="${cx-3}" y2="${headY+3}" stroke="${c.whisker}" stroke-width="0.6"/>`;
  svg += `<line x1="${cx+13}" y1="${headY+1}" x2="${cx+3}" y2="${headY+2}" stroke="${c.whisker}" stroke-width="0.6"/>`;
  svg += `<line x1="${cx+13}" y1="${headY+3}" x2="${cx+3}" y2="${headY+3}" stroke="${c.whisker}" stroke-width="0.6"/>`;

  // Blush
  svg += `<ellipse cx="${cx-7}" cy="${headY+2}" rx="3" ry="2" fill="${c.blush}"/>`;
  svg += `<ellipse cx="${cx+7}" cy="${headY+2}" rx="3" ry="2" fill="${c.blush}"/>`;

  svg += `</g>`; // end head tilt group

  // Zzz for sleeping
  if (showZzz) {
    const zOff = Math.sin(t * Math.PI * 2) * 2;
    svg += `<text x="${cx+14+zOff}" y="${headY-8}" font-size="6" fill="${c.zzz}" font-family="sans-serif" font-weight="bold">Z</text>`;
    svg += `<text x="${cx+18+zOff+1}" y="${headY-14}" font-size="4" fill="${c.zzz}" font-family="sans-serif" font-weight="bold">z</text>`;
  }

  svg += `</svg>`;
  return svg;
}

// ============ 生成横向 spritesheet SVG ============

function generateSpriteSheet(name, frames, fps) {
  const FW = 64, FH = 64;
  const sw = FW * frames;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${0} ${sw} ${FH}" width="${sw}" height="${FH}">`;
  svg += `<defs>`;

  // Generate each frame as a <g> at the correct x offset
  for (let i = 0; i < frames; i++) {
    const frameSvg = svgCatFrame(name, i, frames);
    // Extract content between <svg> tags
    const content = frameSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    svg += `<g id="frame-${i}" transform="translate(${i * FW}, 0)">${content}</g>`;
  }

  svg += `</defs>`;
  // Render all frames inline
  for (let i = 0; i < frames; i++) {
    svg += `<use href="#frame-${i}"/>`;
  }
  svg += `</svg>`;
  return svg;
}

// ============ 主流程 ============

const anims = {
  idle:    { frames: 4, fps: 8 },
  walk:    { frames: 6, fps: 10 },
  sit:     { frames: 2, fps: 4 },
  sleep:   { frames: 3, fps: 3 },
  dragged: { frames: 2, fps: 6 },
};

const outDir = path.join(__dirname, '..', 'assets', 'characters', 'cat');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const spriteData = {};

for (const [name, config] of Object.entries(anims)) {
  const { frames, fps } = config;

  // Generate sprite sheet SVG
  const spriteSvg = generateSpriteSheet(name, frames, fps);
  fs.writeFileSync(path.join(outDir, `${name}.svg`), spriteSvg, 'utf-8');

  // Also generate data URI for direct JS use
  const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(spriteSvg).toString('base64');
  spriteData[name] = {
    dataUri,
    frames,
    fps,
    frameWidth: 64,
    frameHeight: 64,
    sheetWidth: 64 * frames,
    sheetHeight: 64,
  };

  console.log(`  ✓ ${name}.svg (${frames} frames, ${64 * frames}x64)`);
}

// Write meta.json
const meta = {
  name: "cat",
  displayName: "猫咪",
  version: "1.0",
  frameSize: { width: 64, height: 64 },
  offset: { x: 0, y: 0 },
  animations: {},
};
for (const [name, config] of Object.entries(anims)) {
  meta.animations[name] = {
    file: `${name}.svg`,
    frames: config.frames,
    fps: config.fps,
  };
}
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
console.log(`  ✓ meta.json`);

// Write sprite-data.js (data URIs for frontend)
const jsContent = `/**
 * 爪爪桌宠 — 精灵图数据（SVG Data URI）
 * 自动生成的文件，不要手动编辑
 */
export const spriteData = ${JSON.stringify(spriteData, null, 2)};

export function getSpriteUri(name) {
  return spriteData[name]?.dataUri || '';
}
`;
fs.writeFileSync(path.join(outDir, 'sprite-data.js'), jsContent, 'utf-8');
console.log(`  ✓ sprite-data.js`);

console.log(`\nDone! Generated ${Object.keys(anims).length} sprite sheets in ${outDir}`);
