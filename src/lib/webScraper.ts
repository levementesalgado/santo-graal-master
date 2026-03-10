import { ConabData, calculateProductivity } from "./index";

// ============================================================
// CONAB DATA FETCHER — Série Histórica Café
// Fonte: https://portaldeinformacoes.conab.gov.br/download-arquivos.html
// Atualizado quadrimestralmente pela CONAB.
// ============================================================

const CONAB_URL =
  "https://portaldeinformacoes.conab.gov.br/downloads/arquivos/SerieHistoricaCafe.txt";

// Mapeamento de id_produto → nome da cultura
const CROP_MAP: Record<string, string> = {
  "7498": "Café Conillon",
  "7090": "Café Arábica",
};

// Estados cujo id 7090 representa Robusta (não Arábica)
const ROBUSTA_STATES = new Set(["RO", "AM", "PA"]);

// Mapeamento de UF → Região
const REGION_MAP: Record<string, ConabData["region"]> = {
  AC: "NORTE", AM: "NORTE", AP: "NORTE", PA: "NORTE",
  RO: "NORTE", RR: "NORTE", TO: "NORTE",
  AL: "NORDESTE", BA: "NORDESTE", CE: "NORDESTE", MA: "NORDESTE",
  PB: "NORDESTE", PE: "NORDESTE", PI: "NORDESTE", RN: "NORDESTE", SE: "NORDESTE",
  DF: "CENTRO-OESTE", GO: "CENTRO-OESTE", MT: "CENTRO-OESTE", MS: "CENTRO-OESTE",
  ES: "SUDESTE", MG: "SUDESTE", RJ: "SUDESTE", SP: "SUDESTE",
  PR: "SUL", RS: "SUL", SC: "SUL",
};

// ============================================================
// PARSER REAL do arquivo .txt da CONAB
// ============================================================

export const parseConabTxt = (raw: string): ConabData[] => {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Remove cabeçalho
  const dataLines = lines.slice(1);

  const records: ConabData[] = [];

  dataLines.forEach((line) => {
    const cols = line.split(";").map((c) => c.trim());
    if (cols.length < 8) return;

    const year = parseInt(cols[0]);
    const uf = cols[2].toUpperCase();
    const idProduto = cols[4];
    const areaHa = parseFloat(cols[5]) || 0;     // hectares reais
    const producaoT = parseFloat(cols[6]) || 0;  // toneladas
    const produtividade = parseFloat(cols[7]) || 0; // kg/ha

    if (!year || isNaN(year) || !uf || uf === "NI") return;

    // Converte área: ha reais → mil ha
    const areaMilHa = areaHa / 1000;

    // Converte produção: toneladas → mil sacas (1 saca = 60kg)
    // t * 1000 kg/t / 60 kg/saca / 1000 = t / 60
    const producaoMilSacas = producaoT / 60;

    // Determina nome da cultura
    let crop = CROP_MAP[idProduto] ?? "Café";
    if (ROBUSTA_STATES.has(uf) && idProduto === "7090") {
      crop = "Café Robusta";
    }

    const region = REGION_MAP[uf] ?? "SUDESTE";

    records.push({
      id: `conab-${uf}-${year}-${idProduto}`,
      year,
      state: uf,
      region,
      crop,
      production: Math.round(producaoMilSacas * 100) / 100,
      productivity: produtividade,
      area: Math.round(areaMilHa * 100) / 100,
      timestamp: new Date().toISOString(),
    });
  });

  return records;
};

// ============================================================
// FETCH REAL — busca o arquivo da CONAB via proxy CORS
// ============================================================

export const scrapeConabData = async (): Promise<string> => {
  // A CONAB não envia header CORS, então precisamos de um proxy.
  // Usamos o allorigins.win que é público e gratuito.
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(CONAB_URL)}`;

  console.log("[CONAB] Buscando dados reais:", CONAB_URL);

  const response = await fetch(proxyUrl);

  if (!response.ok) {
    throw new Error(
      `Falha ao buscar dados da CONAB: HTTP ${response.status}. ` +
      `O portal pode estar temporariamente indisponível.`
    );
  }

  const text = await response.text();

  if (!text.includes("ano_agricola")) {
    throw new Error(
      "Formato inesperado no arquivo da CONAB. O portal pode ter mudado a estrutura."
    );
  }

  console.log(`[CONAB] Arquivo recebido: ${text.split("\n").length} linhas`);
  return text;
};

// ============================================================
// PIPELINE COMPLETO: fetch → parse → validate
// ============================================================

export const syncAllCrops = async (): Promise<{
  success: boolean;
  count: number;
  message: string;
  data?: ConabData[];
}> => {
  try {
    const raw = await scrapeConabData();
    const parsed = parseConabTxt(raw);
    const validation = validateDataIntegrity(parsed);

    if (!validation.isValid) {
      return {
        success: false,
        count: 0,
        message: `Validação falhou: ${validation.errors[0]}`,
      };
    }

    return {
      success: true,
      count: parsed.length,
      message: `${parsed.length} registros obtidos da CONAB (${new Date().toLocaleDateString("pt-BR")}).`,
      data: parsed,
    };
  } catch (error) {
    return {
      success: false,
      count: 0,
      message: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
};

// ============================================================
// VALIDAÇÃO DE INTEGRIDADE
// ============================================================

export const validateDataIntegrity = (
  data: ConabData[]
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  data.forEach((entry, idx) => {
    if (entry.production < 0)
      errors.push(`[${idx}] Produção negativa: ${entry.state} ${entry.year}`);
    if (entry.area < 0)
      errors.push(`[${idx}] Área negativa: ${entry.state} ${entry.year}`);
    if (entry.year > 2030 || entry.year < 1990)
      errors.push(`[${idx}] Ano fora do intervalo: ${entry.year}`);
    if (entry.productivity > 15000)
      errors.push(`[${idx}] Produtividade anômala: ${entry.productivity} kg/ha em ${entry.state}`);
  });

  return { isValid: errors.length === 0, errors };
};

export const parseConabTables = parseConabTxt;

export const scheduleDataUpdate = (intervalInHours: number = 24): void => {
  console.log(`[Scheduler] Próxima atualização em ${intervalInHours}h`);
  const next = new Date();
  next.setHours(next.getHours() + intervalInHours);
  localStorage.setItem("conab_next_update", next.toISOString());
};
