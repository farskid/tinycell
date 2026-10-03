import { FX, TANK_ID, TILE } from "./BattleCity.ts";

const NOSE = [0x5e, 0x3e, 0x76, 0x3c];
const NOSE_AT = [0, 1, 2, 0];

export function tankGlyphs(): Record<number, number> {
  const glyphs: Record<number, number> = {};
  for (const dirs of TANK_ID) {
    for (let dir = 0; dir < 4; dir++) {
      const ids = dirs[dir]!;
      for (let i = 0; i < 4; i++) {
        glyphs[ids[i]!] = i === NOSE_AT[dir] ? NOSE[dir]! : 0x20;
      }
    }
  }
  glyphs[TILE.brick] = 0x2593;
  glyphs[TILE.steel] = 0x2592;
  glyphs[TILE.water] = 0x2248;
  glyphs[TILE.water2] = 0x223c;
  glyphs[TILE.bush] = 0x2591;
  glyphs[TILE.ice] = 0x2591;
  glyphs[TILE.eagle[0]!] = 0x45;
  glyphs[TILE.eagle[1]!] = 0x20;
  glyphs[TILE.eagle[2]!] = 0x20;
  glyphs[TILE.eagle[3]!] = 0x20;
  glyphs[FX.bullet] = 0x25a0;
  for (const frame of FX.small) for (const id of frame) glyphs[id] = 0x2a;
  for (const frame of FX.big) for (const id of frame) glyphs[id] = 0x2a;
  const scoreCh = [0x31, 0x32, 0x33, 0x34];
  for (let i = 0; i < FX.score.length; i++) {
    glyphs[FX.score[i]![0]!] = scoreCh[i]!;
    glyphs[FX.score[i]![1]!] = 0x30;
  }
  return glyphs;
}
