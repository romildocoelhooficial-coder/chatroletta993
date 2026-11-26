export type AccessPackageId =
  | 'pacote_01_gratuito'
  | 'pacote_02_boas_vindas'
  | 'pacote_03_premium'
  | 'pacote_04_professor';

export type WorldRegionId =
  | 'america_norte'
  | 'america_sul'
  | 'europa'
  | 'africa'
  | 'asia'
  | 'oceania';

export type TeachSubject = 'idiomas' | 'musica' | 'outros';

export interface AccessPackageConfig {
  id: AccessPackageId;
  shortName: string;
  name: string;
  priceLabel: string;
  durationSeconds: number;
  durationLabel: string;
  canChooseRegion: boolean;
  canChooseGender: boolean;
  canReceivePixOnVideo: boolean;
  description: string;
  badgeClass: string;
}

export const ACCESS_PACKAGES: Record<AccessPackageId, AccessPackageConfig> = {
  pacote_01_gratuito: {
    id: 'pacote_01_gratuito',
    shortName: 'Pacote 01 • Gratuito',
    name: 'Pacote 01 - Gratuito',
    priceLabel: 'Gratuito',
    durationSeconds: 60,
    durationLabel: '1 min por interação',
    canChooseRegion: false,
    canChooseGender: false,
    canReceivePixOnVideo: false,
    description: 'Limita as interações em 1 minuto e derruba a conexão automaticamente ao término.',
    badgeClass: 'bg-zinc-700/60 text-zinc-200 border-zinc-600/60',
  },
  pacote_02_boas_vindas: {
    id: 'pacote_02_boas_vindas',
    shortName: 'Pacote 02 • Boas Vindas',
    name: 'Pacote 02 - Boas Vindas',
    priceLabel: 'R$ 20,00 no Pix',
    durationSeconds: 900,
    durationLabel: '15 min por interação',
    canChooseRegion: false,
    canChooseGender: false,
    canReceivePixOnVideo: false,
    description: 'R$ 20,00 no Pix. Sem direito a escolher região ou gênero na roleta.',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  pacote_03_premium: {
    id: 'pacote_03_premium',
    shortName: 'Pacote 03 • Região & Gênero',
    name: 'Pacote 03 - Região, Gênero e 30 min',
    priceLabel: 'Premium 30 min',
    durationSeconds: 1800,
    durationLabel: '30 min por interação',
    canChooseRegion: true,
    canChooseGender: true,
    canReceivePixOnVideo: false,
    description: 'Permite escolher região no planisfério, filtrar por gênero e até 30 minutos de interação.',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
  },
  pacote_04_professor: {
    id: 'pacote_04_professor',
    shortName: 'Pacote 04 • Profissional Aulas',
    name: 'Pacote 04 - Uso Profissional (Aulas)',
    priceLabel: 'R$ 50,00 / mês',
    durationSeconds: 3600,
    durationLabel: '60 min por aula',
    canChooseRegion: true,
    canChooseGender: true,
    canReceivePixOnVideo: true,
    description:
      'R$ 50,00 por mês. Duração da aula de 60 minutos, escolha de região/gênero, QR Code Pix sobre o vídeo e envio de dados bancários ao aluno.',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
};

export const ACCESS_PACKAGE_LIST: AccessPackageConfig[] = [
  ACCESS_PACKAGES.pacote_01_gratuito,
  ACCESS_PACKAGES.pacote_02_boas_vindas,
  ACCESS_PACKAGES.pacote_03_premium,
  ACCESS_PACKAGES.pacote_04_professor,
];

export interface WorldRegionConfig {
  id: WorldRegionId;
  label: string;
  shortLabel: string;
  // Percentages relative to the cropped 631x445 map container
  box: {
    left: string;
    top: string;
    width: string;
    height: string;
  };
  pin: {
    left: string;
    top: string;
  };
}

export const WORLD_REGIONS: WorldRegionConfig[] = [
  {
    id: 'america_norte',
    label: 'América do Norte',
    shortLabel: 'Am. Norte',
    box: { left: '2%', top: '6%', width: '39%', height: '41%' },
    pin: { left: '21%', top: '28%' },
  },
  {
    id: 'america_sul',
    label: 'América do Sul',
    shortLabel: 'Am. Sul',
    box: { left: '22%', top: '47%', width: '19%', height: '36%' },
    pin: { left: '31%', top: '62%' },
  },
  {
    id: 'europa',
    label: 'Europa',
    shortLabel: 'Europa',
    box: { left: '42%', top: '13%', width: '17%', height: '27%' },
    pin: { left: '50%', top: '26%' },
  },
  {
    id: 'africa',
    label: 'África',
    shortLabel: 'África',
    box: { left: '41%', top: '41%', width: '20%', height: '34%' },
    pin: { left: '51%', top: '56%' },
  },
  {
    id: 'asia',
    label: 'Ásia',
    shortLabel: 'Ásia',
    box: { left: '59%', top: '10%', width: '36%', height: '45%' },
    pin: { left: '75%', top: '31%' },
  },
  {
    id: 'oceania',
    label: 'Oceania',
    shortLabel: 'Oceania',
    box: { left: '74%', top: '56%', width: '23%', height: '27%' },
    pin: { left: '84%', top: '69%' },
  },
];

export const TEACH_SUBJECT_LABELS: Record<TeachSubject, string> = {
  idiomas: 'Idiomas',
  musica: 'Música',
  outros: 'Outros',
};

export function inferRegionFromCountry(country?: string, explicitRegion?: WorldRegionId | string): WorldRegionId {
  const validRegions: WorldRegionId[] = [
    'america_norte',
    'america_sul',
    'europa',
    'africa',
    'asia',
    'oceania',
  ];
  if (explicitRegion && validRegions.includes(explicitRegion as WorldRegionId)) {
    return explicitRegion as WorldRegionId;
  }

  const c = (country || '').toLowerCase();
  if (
    c.includes('estados unidos') ||
    c.includes('eua') ||
    c.includes('usa') ||
    c.includes('canad') ||
    c.includes('méxico') ||
    c.includes('mexico') ||
    c.includes('américa do norte') ||
    c.includes('america do norte')
  ) {
    return 'america_norte';
  }
  if (
    c.includes('portugal') ||
    c.includes('espanha') ||
    c.includes('alemanha') ||
    c.includes('frança') ||
    c.includes('franca') ||
    c.includes('itália') ||
    c.includes('italia') ||
    c.includes('reino unido') ||
    c.includes('europa')
  ) {
    return 'europa';
  }
  if (
    c.includes('angola') ||
    c.includes('moçambique') ||
    c.includes('mocambique') ||
    c.includes('áfrica') ||
    c.includes('africa') ||
    c.includes('nigéria') ||
    c.includes('egito')
  ) {
    return 'africa';
  }
  if (
    c.includes('japão') ||
    c.includes('japao') ||
    c.includes('china') ||
    c.includes('índia') ||
    c.includes('india') ||
    c.includes('coreia') ||
    c.includes('ásia') ||
    c.includes('asia') ||
    c.includes('rússia') ||
    c.includes('russia')
  ) {
    return 'asia';
  }
  if (
    c.includes('austrália') ||
    c.includes('australia') ||
    c.includes('nova zelândia') ||
    c.includes('nova zelandia') ||
    c.includes('oceania')
  ) {
    return 'oceania';
  }
  // Default for Brasil / Argentina / Chile / Colômbia / South America / Global fallback
  return 'america_sul';
}

export function getPackageConfig(packageId?: string | null): AccessPackageConfig {
  if (packageId && packageId in ACCESS_PACKAGES) {
    return ACCESS_PACKAGES[packageId as AccessPackageId];
  }
  return ACCESS_PACKAGES.pacote_01_gratuito;
}

export function getRegionLabel(regionId?: string | null): string {
  const found = WORLD_REGIONS.find((r) => r.id === regionId);
  return found ? found.label : 'Global (Todas)';
}

export function formatCountdownMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
