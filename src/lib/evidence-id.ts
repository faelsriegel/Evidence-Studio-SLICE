/**
 * Lógica de geração do ID de evidência.
 *
 * Formato: {SIGLA}-{ANO}-{CTRL}-{SEQ:03d}
 *   SIGLA  = iniciais das palavras com >2 chars do nome da empresa auditora (max 4 letras)
 *   ANO    = ano de 4 dígitos extraído de imageDate (YYYY-MM-DD)
 *   CTRL   = evidenceNumber com apenas alfanuméricos (pontos/barras removidos)
 *   SEQ    = contador crescente para múltiplas evidências da mesma requisição
 *
 * Exemplo: "EMPRESA AUDITORA", "14.1", "2026-04-26", seq=1 → "EA-2026-141-001"
 */

/**
 * Gera a chave de lote usada para detectar se é uma nova requisição ou
 * mais um print da mesma (empresa + controle + data).
 */
export function buildBatchKey(
  targetCompany: string,
  evidenceNumber: string,
  imageDate: string,
): string {
  return [
    targetCompany.trim().toUpperCase(),
    evidenceNumber.trim(),
    imageDate.trim(),
  ].join("|");
}

/**
 * Extrai a sigla de até 4 letras de um nome de empresa.
 * Ignora palavras com ≤2 caracteres (preposições como "DA", "DE", "DO", "S.A.").
 */
export function companyAcronym(company: string): string {
  const acronym = company
    .trim()
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "") // remove pontuação
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4)
    .map((w) => w[0])
    .join("");

  return acronym || "EV";
}

/**
 * Monta o ID da evidência a partir dos componentes.
 */
export function generateEvidenceId(
  targetCompany: string,
  evidenceNumber: string,
  imageDate: string,
  seq: number,
): string {
  const prefix = companyAcronym(targetCompany);
  const year = imageDate.split("-")[0] || String(new Date().getFullYear());
  const ctrl = evidenceNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "000";
  const seqStr = String(seq).padStart(3, "0");
  return `${prefix}-${year}-${ctrl}-${seqStr}`;
}
