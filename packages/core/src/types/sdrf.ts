/** A parsed SDRF file */
export interface SdrfFile {
  /** Column headers as they appear in the file */
  headers: string[];

  /** Rows of data */
  rows: SdrfRow[];
}

export interface SdrfRow {
  /** 0-based row index in the original file (excluding header row) */
  index: number;

  /** Column name → cell value */
  cells: Record<string, string>;
}
