import { readFileSync } from "fs";
import CEA608, { Region } from "./cea608";

const tiemstamp_for_vtt = (timestamp: string) => {
  const [HH, MM, SS, FF] = timestamp.split(/[:;]/);
  return `${HH}:${MM}:${SS}.${Math.trunc(Number.parseInt(FF, 10) * 1000 / 30).toString(10).padStart(3, '0')}`
}

const parseSCC = (scc: string) => {
  const [header, ... lines] = scc.split('\n')
  if (!header.startsWith('Scenarist_SCC')) { return; }

  const parser = new CEA608();
  let previous: [string, Region[]] | null = null;

  for (const line of lines) {
    if (line.trim() === '') { continue; }

    const [timestamp, content] = line.trim().split('\t');
    const cc = content.split(' ');
    const binary = new ArrayBuffer(cc.length * 2);
    const view = new DataView(binary);
    for (let i = 0; i < cc.length; i++) {
      view.setUint8(i * 2 + 0, Number.parseInt(cc[i][0], 16) * 16 + Number.parseInt(cc[i][1], 16));
      view.setUint8(i * 2 + 1, Number.parseInt(cc[i][2], 16) * 16 + Number.parseInt(cc[i][3], 16));
    }

    parser.push(binary);

    const regions = parser.getRegions();
    if (!previous) {
      previous = [timestamp, regions];
      continue;
    } else if (!parser.hasClearscreen()) {
      previous[1] = regions;
      continue;
    }

    const [p_timestamp, p_regions] = previous;
    if (p_regions.length > 0) {
      const vtts = p_regions.map((region) => {
        const header = `${tiemstamp_for_vtt(p_timestamp)} --> ${tiemstamp_for_vtt(timestamp)} lines:${region.row} position:${region.column / 32 * 100}% align:left`
        return `${header}\n${region.text}\n\n`;
      });

      console.log(vtts.join(''));
    }

    previous = [timestamp, regions];
  }
}
