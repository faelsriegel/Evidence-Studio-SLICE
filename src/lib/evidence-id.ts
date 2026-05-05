/**
 * Lógica de geração do ID de evidência.
 *
 * Formato: {SIGLA}-{MAJOR:03d}-{MINOR:03d}-{SEQ:03d}-{ANO}
 *   SIGLA  = iniciais das palavras com >2 chars do nome da empresa auditora (max 4 letras)
 *            ou valor manual do campo evidenceAcronym
 *   MAJOR  = parte inteira do número de controle, zero-padded 3 dígitos (14.1 → 014)
 *   MINOR  = parte decimal do número de controle, zero-padded 3 dígitos (14.1 → 001)
 *            se não tiver parte decimal, usa 000
 *   SEQ    = contador crescente para múltiplas evidências da mesma requisição
 *   ANO    = ano de 4 dígitos extraído de imageDate (YYYY-MM-DD)
 *
 * Exemplo: "BRASIL AUDITORES", "14.1", "2026-04-26", seq=1 → "BRA-014-001-001-2026"
 */

/**
 * Gera a chave de lote usada para detectar se é uma nova requisição ou
 * mais um print da mesma (empresa + titulo + controle).
 */
export function buildBatchKey(
  targetCompany: string,
  evidenceNumber: string,
  evidenceTitle: string,
): string {
  return [
    targetCompany.trim().toUpperCase(),
    evidenceTitle.trim().toUpperCase(),
    evidenceNumber.trim(),
  ].join("|");
}

/**
 * Extrai a sigla de até 4 letras de um nome de empresa.
 * - Quando há ≥ 2 palavras com mais de 2 caracteres, usa as iniciais delas.
 * - Quando há só 1 palavra "útil" (ex.: "SLICE"), usa as 3 primeiras letras
 *   dela (evita siglas de uma única letra como "S").
 */
export function companyAcronym(company: string): string {
  const words = company
    .trim()
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "") // remove pontuação
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (words.length === 0) {
    return "EV";
  }

  if (words.length === 1) {
    return words[0].slice(0, Math.min(4, words[0].length));
  }

  return words.slice(0, 4).map((w) => w[0]).join("");
}

/**
 * Monta o ID da evidência a partir dos componentes.
 * @param acronym - sigla manual (override); se vazio usa iniciais da empresa
 */
export function generateEvidenceId(
  targetCompany: string,
  evidenceNumber: string,
  imageDate: string,
  seq: number,
  acronym?: string,
): string {
  const prefix = acronym?.trim().toUpperCase() || companyAcronym(targetCompany);
  const year = imageDate.split("-")[0] || String(new Date().getFullYear());

  // Separa parte inteira e decimal do número de controle (ex: "14.1" → major=14, minor=1)
  const dotIdx = evidenceNumber.indexOf(".");
  const rawMajor = dotIdx >= 0 ? evidenceNumber.slice(0, dotIdx) : evidenceNumber;
  const rawMinor = dotIdx >= 0 ? evidenceNumber.slice(dotIdx + 1) : "";

  // Mantém apenas dígitos para o padding; se não numérico, usa como string
  const majorNum = parseInt(rawMajor.replace(/\D/g, ""), 10);
  const minorNum = rawMinor ? parseInt(rawMinor.replace(/\D/g, ""), 10) : NaN;

  const major = isNaN(majorNum) ? rawMajor.toUpperCase() : String(majorNum).padStart(3, "0");
  const minor = isNaN(minorNum) ? "000" : String(minorNum).padStart(3, "0");
  const seqStr = String(seq).padStart(3, "0");

  return `${prefix}-${major}-${minor}-${seqStr}-${year}`;
}
