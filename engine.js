// engine.js
// Processa escalaPadraoCorreto.txt + escalinha.TXT e gera CSV de saída

// ─── Utilitários ──────────────────────────────────────────────────────────────

function extractField(line, start, end) {
  return (line.substring(start, end) || '').trim();
}

function isBlankLine(line) {
  return line.trim() === '';
}

// ─── Parser: escalaPadraoCorreto.txt ─────────────────────────────────────────
// Retorna array de objetos:
// { linha, frota, codEscala, efetivo, folguista, servico, horaInicial, horaFinal }

function parseEscalaPadrao(text) {
  const cfg = SETTINGS.escalaPadrao;
  const lines = text.split(/\r?\n/);
  const records = [];

  let headerFound = false;

  for (const rawLine of lines) {
    // Pular linhas até encontrar o cabeçalho real
    if (!headerFound) {
      if (rawLine.includes(cfg.headerLineMarker) && rawLine.includes('Frota')) {
        headerFound = true;
      }
      continue;
    }

    // Ignorar separadores
    if (cfg.separatorPattern.test(rawLine.trim())) continue;

    // Ignorar linhas vazias
    if (isBlankLine(rawLine)) continue;

    const c = cfg.columns;
    const linha       = extractField(rawLine, c.linha[0],       c.linha[1]);
    const frota       = extractField(rawLine, c.frota[0],       c.frota[1]);
    const codEscala   = extractField(rawLine, c.codEscala[0],   c.codEscala[1]);
    const efetivo     = extractField(rawLine, c.efetivo[0],     c.efetivo[1]);
    const folguista   = extractField(rawLine, c.folguista[0],   c.folguista[1]);
    const servico     = extractField(rawLine, c.servico[0],     c.servico[1]);
    const horaInicial = extractField(rawLine, c.horaInicial[0], c.horaInicial[1]);
    const horaFinal   = extractField(rawLine, c.horaFinal[0],   c.horaFinal[1]);

    if (!linha || !servico) continue;
    if (SETTINGS.linhasIgnorar.includes(linha)) continue;

    records.push({ linha, frota, codEscala, efetivo, folguista, servico, horaInicial, horaFinal });
  }

  return records;
}

// ─── Parser: escalinha.TXT ────────────────────────────────────────────────────
// Retorna Map: "LINHA|TAB" -> { entrada, saida }

function parseEscalinha(text) {
  const cfg = SETTINGS.escalinha;
  const lines = text.split(/\r?\n/);

  // Mapa resultado: chave = "linha|servico" => { entrada, saida }
  const map = new Map();

  let currentLinha = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Ignorar vazios
    if (isBlankLine(rawLine)) continue;

    // Ignorar separadores
    if (cfg.separatorPattern.test(trimmed)) continue;

    // Ignorar cabeçalhos de página
    if (cfg.headerPatterns.some(p => p.test(trimmed))) continue;

    // Detectar marcador de linha: "Linha :  206 - CPA 1 X CENTRO"
    if (trimmed.startsWith(cfg.linhaMarker)) {
      const afterColon = trimmed.replace(cfg.linhaMarker, '').trim();
      const dashIdx = afterColon.indexOf(' - ');
      const linhaDetectada = dashIdx !== -1 ? afterColon.substring(0, dashIdx).trim() : afterColon.trim();
      currentLinha = SETTINGS.linhasIgnorar.includes(linhaDetectada) ? null : linhaDetectada;
      continue;
    }

    if (!currentLinha) continue;

    const c = cfg.columns;
    const servico  = extractField(rawLine, c.servico[0],  c.servico[1]);
    const entrada  = extractField(rawLine, c.entrada[0],  c.entrada[1]);
    const saida    = extractField(rawLine, c.saida[0],    c.saida[1]);
    const regist   = extractField(rawLine, c.regist[0],   c.regist[1]);

    if (!servico || !entrada || !saida) continue;

    // Chave: "linha|servico"
    const key = `${currentLinha}|${servico}`;

    // Pode haver mais de uma entrada para mesma combinação (motorista diferente);
    // guardamos apenas a primeira ocorrência (referência de horário)
    if (!map.has(key)) {
      map.set(key, { entrada, saida, regist });
    }
  }

  return map;
}

// ─── Engine principal ─────────────────────────────────────────────────────────
// Retorna string CSV

function processFiles(escalaPadraoText, escalinhaText) {
  const padrao    = parseEscalaPadrao(escalaPadraoText);
  const escalinha = parseEscalinha(escalinhaText);

  // ── Agrupar registros por par (efetivo, folguista) usando o efetivo como chave ──
  // Cada condutor (efetivo) pode ter N tabelas.
  // Estrutura: Map<efetivo, { folguistas: Set, tabelas: [] }>

  const condutores = new Map();
  let semEfetivoCounter = 0;

  for (const rec of padrao) {
    const condutorKey = rec.efetivo || `__sem_efetivo_${semEfetivoCounter++}`;

    if (!condutores.has(condutorKey)) {
      condutores.set(condutorKey, {
        efetivo: rec.efetivo,
        tabelasFolguistas: [], // [{ folguista, servico, linha }]
        tabelas: [],           // [{ frota, linha, tab, inicio, term, folguista }]
      });
    }

    const condutor = condutores.get(condutorKey);

    // Buscar horários no escalinha
    const key = `${rec.linha}|${rec.servico}`;
    const horarios = escalinha.get(key);
    const inicio = horarios ? horarios.entrada : rec.horaInicial;
    const term   = horarios ? horarios.saida   : rec.horaFinal;

    condutor.tabelas.push({
      frota:     rec.frota,
      linha:     rec.linha,
      tab:       rec.servico,
      inicio,
      term,
      folguista: rec.folguista,
    });

    condutor.tabelasFolguistas.push({
      folguista: rec.folguista,
      servico:   rec.servico,
      linha:     rec.linha,
    });
  }

  // ── Determinar MOT 2 e STATUS para cada condutor ──────────────────────────

  const rows = [];

  for (const [, condutor] of condutores) {
    const efetivo = condutor.efetivo;
    const folguistas = condutor.tabelasFolguistas.map(t => t.folguista).filter(Boolean);

    // Conjunto único de folguistas
    const uniqueFolguistas = [...new Set(folguistas)];

    let mot2   = '';
    let status = SETTINGS.output.status.OK;

    if (uniqueFolguistas.length === 0) {
      // Sem folguista definido
      mot2   = '';
      status = SETTINGS.output.status.OK;

    } else if (uniqueFolguistas.length === 1) {
      mot2 = uniqueFolguistas[0];

      // Verificar se o efetivo aparece como folguista do seu próprio par (INVERTIDO)
      // ou se o folguista aparece como efetivo em outra linha apontando para outro folguista
      // STATUS = OK por enquanto; checagem de INVERTIDO feita abaixo
      status = SETTINGS.output.status.OK;

    } else {
      // Mais de um folguista diferente → DIVERGENTE
      mot2   = uniqueFolguistas[0]; // usa o primeiro encontrado
      status = SETTINGS.output.status.DIVERGENTE;
    }

    // Verificar INVERTIDO: o efetivo e folguista trocaram de posição em algum par
    // Só verifica se status ainda é OK
    if (status === SETTINGS.output.status.OK && mot2 && efetivo) {
      // Verificar se mot2 aparece como efetivo com mot1 como folguista
      const invertido = condutores.has(mot2) &&
        condutores.get(mot2).tabelasFolguistas.some(t => t.folguista === efetivo);

      if (invertido) {
        // Determinar qual é o "efetivo principal": o que aparece primeiro no arquivo
        // (já que ambos apontam um para o outro, apenas um deles deve gerar linha)
        // Geramos a linha pelo par com menor matrícula para evitar duplicata
        if (efetivo > mot2) continue; // pula: o par já foi (ou será) gerado pelo outro
        status = SETTINGS.output.status.INVERTIDO;
      }
    }

    // ── Ordenar tabelas por horário e ajustar virada de dia ──────────────────
    const tabelasAjustadas = adjustTablesForDayWrapping(condutor.tabelas);

    rows.push({ efetivo, mot2, status, tabelas: tabelasAjustadas });
  }

  // ── Determinar o número máximo de tabelas para montar o cabeçalho ─────────
  const maxTabelas = rows.reduce((max, r) => Math.max(max, r.tabelas.length), 0);

  const fixedCols      = SETTINGS.output.fixedColumns;
  const repeatingCols  = SETTINGS.output.repeatingColumns;
  const gapEntreLinhas = SETTINGS.output.gapEntreLinhas ?? 0;

  // Montar cabeçalho
  const headerParts = [...fixedCols];
  for (let i = 1; i <= maxTabelas; i++) {
    repeatingCols.forEach(col => headerParts.push(`${col} ${i}`));
  }

  // Ordenar rows pela primeira linha do condutor (crescente)
  rows.sort((a, b) => {
    const linhaA = a.tabelas[0]?.linha ?? '';
    const linhaB = b.tabelas[0]?.linha ?? '';
    return linhaA.localeCompare(linhaB, undefined, { numeric: true });
  });

  const totalCols = fixedCols.length + maxTabelas * repeatingCols.length;
  const blankRow  = Array(totalCols).fill('').join(',');

  const csvLines = [headerParts.join(';')];
  let lastLinha  = null;

  for (const row of rows) {
    const currentLinha = row.tabelas[0]?.linha ?? '';

    // Inserir linhas em branco ao mudar de grupo de linha
    if (lastLinha !== null && currentLinha !== lastLinha) {
      for (let g = 0; g < gapEntreLinhas; g++) {
        csvLines.push(blankRow.replace(/,/g, ';'));
      }
    }
    lastLinha = currentLinha;

    const parts = [
      csvEscape(row.efetivo),
      csvEscape(row.mot2),
      csvEscape(row.status),
    ];

    for (let i = 0; i < maxTabelas; i++) {
      const tab = row.tabelas[i];
      if (tab) {
        parts.push(csvEscape(tab.frota));
        parts.push(csvEscape(tab.linha));
        parts.push(csvEscape(tab.tab));
        parts.push(csvEscape(tab.inicio));
        parts.push(csvEscape(tab.term));
      } else {
        // Tabela não existe para este condutor: células vazias
        repeatingCols.forEach(() => parts.push(''));
      }
    }

    csvLines.push(parts.join(';'));
  }

  return csvLines.join('\n');
}

// ─── Utilitários para horários ────────────────────────────────────────────────

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function adjustTablesForDayWrapping(tabelas) {
  // Ordena tabelas por hora de início
  const sorted = [...tabelas].sort((a, b) => {
    const minA = timeToMinutes(a.inicio) ?? 0;
    const minB = timeToMinutes(b.inicio) ?? 0;
    return minA - minB;
  });

  // Ajusta horários para virada de dia
  let lastEndMinutes = null;
  for (let i = 0; i < sorted.length; i++) {
    const tab = sorted[i];
    let startMin = timeToMinutes(tab.inicio);
    let endMin = timeToMinutes(tab.term);

    if (startMin === null || endMin === null) continue;

    // Se a hora de término é menor que a hora de início, virou o dia
    if (endMin < startMin) {
      endMin += 24 * 60; // Adiciona 24 horas
    }

    // Se a hora de início é menor que a hora anterior de término, virou o dia
    if (lastEndMinutes !== null && startMin < lastEndMinutes) {
      const daysToAdd = Math.floor(lastEndMinutes / (24 * 60)) + 1;
      startMin += daysToAdd * 24 * 60;
      endMin += daysToAdd * 24 * 60;
    }

    tab.inicio = minutesToTime(startMin);
    tab.term = minutesToTime(endMin);
    lastEndMinutes = endMin;
  }

  return sorted;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
