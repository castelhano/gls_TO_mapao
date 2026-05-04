// settings.js
// Mapeamento de colunas para cada arquivo de entrada
// As colunas são identificadas por posição baseada em largura fixa (índice de caracteres)

const SETTINGS = {

  // ─── escalaPadraoCorreto.txt ───────────────────────────────────────────────
  // Colunas (baseadas no cabeçalho do arquivo):
  //   A: Linha         B: Frota         C: Cód. Escala
  //   D: Efetivo       E: Folguista     F: Serviço
  //   G: Hora Inicial  H: Hora Final
  escalaPadrao: {
    // Intervalos de caracteres [inicio, fim] para cada coluna (trim será aplicado)
    columns: {
      linha:       [9,   14],   // A
      frota:       [20,  27],   // B
      codEscala:   [36,  47],   // C
      efetivo:     [54,  61],   // D - MOT 1
      folguista:   [68,  77],   // E - MOT 2
      servico:     [82,  89],   // F - TAB
      horaInicial: [100, 105],  // G - INICIO (sobrescrito pelo escalinha)
      horaFinal:   [124, 129],  // H - TERM   (sobrescrito pelo escalinha)
    },
    // Linha que contém o cabeçalho (0-based); linhas antes dela são ignoradas
    headerLineMarker: 'Linha',
    // Separadores de página a ignorar
    separatorPattern: /^-{10,}/,
    // Linha totalmente vazia ou apenas espaços: ignorar
    skipEmpty: true,
  },

  // ─── escalinha.TXT ────────────────────────────────────────────────────────
  // Colunas (baseadas no cabeçalho do arquivo):
  //   CARRO | SERV. | ENTRA | SAIDA | REGIST | APELIDO | ... | LOCAL MOT.
  escalinha: {
    columns: {
      carro:    [0,    8],   // número do veículo (pode ser vazio)
      servico:  [10,  15],  // TAB (ex: 01A, 02C, NOT, R1_A)
      entrada:  [16,  21],  // ENTRA - INICIO real
      saida:    [22,  27],  // SAIDA - TERM real
      regist:   [28,  34],  // matrícula do motorista
      apelido:  [35,  104],  // apelido
      localMot: [105,  130], // LOCAL MOT.
    },
    // Marcador de início de seção de linha
    linhaMarker: 'Linha :',
    // Separadores a ignorar
    separatorPattern: /^={10,}|^-{10,}/,
    // Linhas de cabeçalho repetido (páginas)
    headerPatterns: [
      /ESCALINHA DE SERVICOS/,
      /Empresa\s*:/,
      /Filial\s*:/,
      /MOTORISTA/,
      /CARRO\s+SERV/,
      /Total Geral/,
    ],
    skipEmpty: true,
  },

  // ─── Colunas de saída do CSV ───────────────────────────────────────────────
  output: {
    // Linhas em branco inseridas entre grupos de linhas diferentes no CSV
    gapEntreLinhas: 3,
    // Colunas fixas (uma vez por condutor)
    fixedColumns: ['MOT 1', 'MOT 2', 'STATUS'],
    // Colunas repetidas por tabela (N vezes, uma por tabela do condutor)
    repeatingColumns: ['FROTA', 'LINHA', 'TAB', 'INICIO', 'TERM'],
    // Valores possíveis de STATUS
    status: {
      OK:         'OK',
      DIVERGENTE: 'DIVERGENTE',
      INVERTIDO:  'INVERTIDO',
    },
  },
};
