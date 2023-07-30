import { BASIC_AMERICAN, EXTENDED_PORTUGUESE_GERMAN_DANISH, EXTENDED_SPANISH_FRENCH_MISC, SPECIAL_AMERICAN } from "./charset";

type State = {
  row: number;
  column: number;
  foreground: string;
  background: string;
  underline: boolean;
};

export type Region = State & {
  text: string;
};

const fg_colors = [
  'white',
  'green',
  'blue',
  'cyan',
  'red',
  'yellow',
  'magenta',
  'white',
];

const bg_colors = [
  'white',
  'green',
  'blue',
  'cyan',
  'red',
  'yellow',
  'magenta',
  'black',
]

export default class CEA608 {
  private regions: Region[] = [];
  private state: State = {
    row: 10,
    column: 0,
    foreground: 'white',
    background: 'black',
    underline: false
  };
  private styleChanged = true;
  private clearscrren = false;

  private getCurrentRegion(): Region | null {
    return this.regions[this.regions.length - 1] ?? null;
  }
  private pushRegion(): void {
    this.regions.push({
      ... this.state,
      text: ''
    });
  }
  private clearRegions(): void {
    this.regions = [];
    this.styleChanged = true;
  }

  private parseBackspace(): void {
    const region = this.getCurrentRegion();
    if (!region) { return; }

    region.text = region.text.slice(0, -1);
  }

  private parseOtherCommand(cc_data_0: number, cc_data_1: number): boolean {
    const hasNormalCommand = [0x14 /*CC1*/, 0x1C /*CC2*/, 0x15 /*CC3*/, 0x1D /*CC4*/].includes(cc_data_0) && (0x20 <= cc_data_1 && cc_data_1 <= 0x2F);
    const hasTabOffset = [0x17 /*CC1/3*/, 0x1F /*CC2/4*/].includes(cc_data_0) && (0x10 <= cc_data_1 && cc_data_1 <= 0x23);
    if (!(hasNormalCommand || hasTabOffset)) { return false; }

    switch(cc_data_1) {
      case 0x20:
        this.clearscrren = true;
        this.clearRegions()
        break;
      case 0x21: // Backspace
        //this.parseBackspace();
        break;
      case 0x2C:
        this.clearscrren = true;
        this.clearRegions()
        break;
      default:
        // TODO: Implement
        break;
    }

    return true;
  }

  private parseMidRowStylingCommand(cc_data_0: number, cc_data_1: number): boolean {
    const hasMidRowCommand = [0x11, 0x19].includes(cc_data_0) && (0x20 <= cc_data_1 && cc_data_1 <= 0x2F);
    if (!hasMidRowCommand) { return false; }

    const foreground = fg_colors[(cc_data_1 >> 1) & 0x07];
    const underline = (cc_data_1 & 0x01) !== 0;

    const next_state: State = {
      ... this.state,
      foreground,
      underline
    };

    this.styleChanged ||= !!Object.keys(this.state).find((key) => this.state[key as keyof State] !== next_state[key as keyof State]);
    this.state = next_state;
    return true;
  }

  private parsePreableAccessCodes(cc_data_0: number, cc_data_1: number): boolean {
    const row_is_not_zero = ((0x11 <= cc_data_0 && cc_data_0 <= 0x17) || (cc_data_0 >= 0x19 && cc_data_0 <= 0x1F)) && cc_data_1 >= 0x40 && cc_data_1 <= 0x7F;
    const row_is_zero = (cc_data_0 === 0x10 || cc_data_0 === 0x18) && (0x40 <= cc_data_1 && cc_data_1 <= 0x5F);
    if (!(row_is_not_zero || row_is_zero)) {
      return false;
    }

    const row = [11, -1, 1, 2, 3, 4, 12, 13, 14, 15, 5, 6, 7, 8, 9, 10][((cc_data_0 << 1) & 0x0E) | ((cc_data_1 >> 5) & 0x01)] - 1;
    const column = (cc_data_1 & 0x10) === 0 ? 0 : ((cc_data_1 >> 1) & (0x07)) * 4;
    const foreground = fg_colors[(cc_data_1 & 0x10) !== 0 ? 0 : ((cc_data_1 >> 1) & (0x07))];
    const underline = (cc_data_1 & 0x01) !== 0;

    const next_state: State = {
      ... this.state,
      foreground,
      underline,
      row,
      column
    };

    this.styleChanged ||= !!Object.keys(this.state).find((key) => this.state[key as keyof State] !== next_state[key as keyof State]);
    this.state = next_state;
    return true;
  }

  private parseBackground(cc_data_0: number, cc_data_1: number): boolean {
    const hasSetBgColor = [0x10, 0x18].includes(cc_data_0) && (0x20 <= cc_data_1 && cc_data_1 <= 0x2F);
    const hasNoBg = [0x17, 0x1F].includes(cc_data_0) && cc_data_1 === 0x2D;
    const hasDefaultText = [0x17, 0x1F].includes(cc_data_0) && (cc_data_1 === 0x2E || cc_data_1 === 0x2F);
    if (!(hasSetBgColor || hasNoBg || hasDefaultText)) { return false; }

    let next_state: State = {
      ... this.state,
    };

    if (hasSetBgColor) {
      next_state.background = bg_colors[(cc_data_1 & 0x10) !== 0 ? 0 : ((cc_data_1 >> 1) & (0x07))];
    } else if (hasNoBg) {
      next_state.background = 'transparent';
    } else if (hasDefaultText) {
      next_state.foreground = 'white';
      next_state.underline = (cc_data_1 & 0x01) !== 0;
    }

    this.styleChanged ||= !!Object.keys(this.state).find((key) => this.state[key as keyof State] !== next_state[key as keyof State]);
    this.state = next_state;
    return true;
  }

  private parseCharacters(cc_data_0: number, cc_data_1: number): void {
    switch(cc_data_0) {
      case 0x11:
        this.parseBackspace();
        this.parseCharacter(cc_data_1, SPECIAL_AMERICAN);
        return;
      case 0x12:
        this.parseBackspace();
        this.parseCharacter(cc_data_1, EXTENDED_SPANISH_FRENCH_MISC);
        return;
      case 0x13:
        this.parseBackspace();
        this.parseCharacter(cc_data_1, EXTENDED_PORTUGUESE_GERMAN_DANISH);
        return;
    }
    this.parseCharacter(cc_data_0, BASIC_AMERICAN);
    this.parseCharacter(cc_data_1, BASIC_AMERICAN);
  }

  private parseCharacter(index: number, charset: Map<number, string>) {
    if (index === 0) { return; }

    let character: string | null = null;
    if (charset.has(index)) {
      character = charset.get(index)!;
    } else if (charset === BASIC_AMERICAN) {
      character = String.fromCharCode(index);
    }
    if (character == null) { return; }

    if (this.styleChanged) {
      this.pushRegion();
      this.styleChanged = false;
    }
    const region = this.getCurrentRegion();
    if (!region) { return; }

    region.text += character;
    this.state.column += 1;
  }

  public push(binary: ArrayBuffer) {
    const view = new DataView(binary);
    this.clearscrren = false;

    for (let offset = 0; offset < view.byteLength; offset += 2) {
      const cc_data_0 = view.getUint8(offset + 0) & 0x7F;
      const cc_data_1 = view.getUint8(offset + 1) & 0x7F;

      if (cc_data_0 === 0 && cc_data_1 === 0) { continue; } // NULL PAD

      if (this.parseOtherCommand(cc_data_0, cc_data_1)) { continue; }
      if (this.parseMidRowStylingCommand(cc_data_0, cc_data_1)) { continue; }
      if (this.parsePreableAccessCodes(cc_data_0, cc_data_1)) { continue; }
      if (this.parseBackground(cc_data_0, cc_data_1)) { continue; }

      this.parseCharacters(cc_data_0, cc_data_1);
    }
  }

  public clear() {
    this.clearRegions();
  }

  public hasClearscreen(): boolean {
    return this.clearscrren;
  }

  public getRegions(): Region[] {
    return [... this.regions];
  }
}