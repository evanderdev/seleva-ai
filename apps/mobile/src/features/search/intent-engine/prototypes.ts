/** Training prototypes, deliberately separate from held-out evaluation sentences. */
export const prototypes = [
  {
    concept: 'free_space',
    texts: [
      'Find files to free up storage on my phone',
      'I need more room on my device',
      'Liberar espaço no celular',
      'Quiero recuperar almacenamiento',
    ],
    patch: { cleanupCandidate: true, freeSpace: true },
  },
  {
    concept: 'cleanup_candidate',
    texts: [
      'Review unnecessary pictures that are no longer useful',
      'Find disposable clutter in the gallery',
      'Encontrar imagens que já não preciso guardar',
      'Fotos que ya no necesito',
    ],
    patch: { cleanupCandidate: true },
  },
  {
    concept: 'duplicate',
    texts: [
      'Find repeated copies of the same picture',
      'There are many identical photos',
      'Encontre fotos repetidas',
    ],
    filters: { duplicate: true },
  },
  {
    concept: 'similar',
    texts: [
      'Show pictures that look almost the same',
      'Find similar photos in a sequence',
      'Fotos quase iguais da mesma sequência',
    ],
    filters: { similar: true },
  },
  {
    concept: 'best_shot',
    texts: [
      'Keep only the best picture from each sequence',
      'Choose one good shot and review the rest',
      'Quero ficar só com a melhor foto de cada sequência',
      'Pick the strongest image from every burst and discard weaker shots',
      'Deixar a melhor imagem de cada grupo de fotos parecidas',
    ],
    patch: { bestShot: true, cleanupCandidate: true },
    filters: { similar: true },
  },
  {
    concept: 'screenshot',
    texts: [
      'Find screen captures saved from my phone',
      'Show screenshots',
      'Capturas de tela',
    ],
    filters: { screenshot: true },
  },
  {
    concept: 'blurry',
    texts: [
      'Find photos that are out of focus',
      'Show blurred shaky pictures',
      'Fotos sem foco e tremidas',
    ],
    filters: { minBlur: 0.55 },
  },
  {
    concept: 'delivery_tracking',
    texts: [
      'Find saved package shipment tracking screenshots',
      'Track deliveries from online purchases',
      'Prints de rastreamento de encomendas',
      'Screenshots of orders and packages that have already arrived',
      'Telas salvas de compras e entregas concluídas',
    ],
    category: 'delivery_tracking',
  },
  {
    concept: 'otp',
    texts: [
      'Find saved one time verification codes that expired',
      'Temporary login security codes',
      'Códigos de acesso que já expiraram',
    ],
    category: 'otp',
  },
  {
    concept: 'receipt',
    texts: [
      'Find purchase receipts',
      'Show old receipts',
      'Procurar recibos de compras',
    ],
    category: 'receipt',
  },
  {
    concept: 'bank_receipt',
    texts: [
      'Find bank transfer payment confirmations',
      'Comprovantes PIX de pagamentos',
    ],
    category: 'bank_receipt',
  },
  {
    concept: 'document',
    texts: [
      'Find scanned personal documents',
      'Procurar documentos digitalizados',
    ],
    category: 'document',
  },
  {
    concept: 'large_video',
    texts: [
      'Review videos taking up a lot of space',
      'Find very large video files',
      'Vídeos pesados ocupando espaço',
    ],
    filters: { mediaTypes: ['video'], minFileSize: 524288000 },
  },
  // Rejection prototypes compete with in-domain concepts; similarity isn't probability.
  {
    concept: 'out_of_domain',
    texts: [
      'What is the weather forecast today?',
      'Write a recipe for dinner',
      'Play my favorite music',
      'Tell me a joke',
      'Translate this sentence',
      'What is the meaning of life?',
    ],
  },
] as const;
