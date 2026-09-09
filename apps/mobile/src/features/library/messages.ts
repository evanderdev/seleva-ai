export const libraryEn = {
  viewProgress: 'View processing progress',
  progressTitle: 'Processing progress',
  progressStage: 'Current step',
  progressReading: 'Finding photos and videos',
  progressOpening: 'Preparing to process your library',
  progressHint:
    'Seleva is organizing your library to find similar photos, blur and searchable text. Everything happens on your phone.',
  progressStepHint:
    'Progress is shown for the current step. The counter starts again when the next step begins.',
  progressWaiting: 'Preparing this step…',
  progressComplete: 'Processing complete',
  progressPaused: 'Processing paused',
  progressSaved: 'Your progress is saved. You can continue exploring.',
  progressResume: 'Continue processing',
  progressRemaining: '{{count}} items still need processing',
  progressPercent: '{{percent}}% of this step',
  progressDetails: 'You can go back and explore while processing continues.',
  limitedLibraryEmpty:
    'Android is not exposing any photos to SelevaAI. Open Settings to choose accessible photos or allow access to your library.',
  fastAnalysis: 'Finding blur and similar photos',
  deepAnalysis: 'Reading text and verifying exact duplicates',
  stagedAnalysisAvailable:
    '{{count}} fast results · {{pending}} awaiting full analysis',
  preanalysisSummary: 'Pre-analysis summary',
  initialPreparationTitle: 'Preparing your photo summary',
  initialPreparationHint:
    'Just a moment. We’re getting everything ready for you.',
  initialPreparationPending:
    'Some items could not be analyzed. Your progress is saved. Try again to finish preparing your library.',
  initialCacheStep: 'Checking saved analysis',
  initialMetadataStep: 'Step 1 of 2 · Reading your library',
  initialAnalysisStep: 'Step 2 of 2 · Analyzing and categorizing',
  scanPartial: 'Saved results available; some items are still pending',
  metadataAvailable: '{{count}} items in the index',
  analysisAvailable: '{{count}} analyzed · {{pending}} pending',
  savedAnalysisHint:
    'Each completed batch is saved and available. Updates reuse existing analysis. Check for new photos with Update library.',
  preparingLibrary: 'Preparing your library',
  analyzingLibrary: 'Finding opportunities',
  preparationHint: 'You can explore while we prepare everything on your phone.',
  scanReady: 'Your library is ready',
  scanPaused: 'We will continue when you return',
  scanCounts: '{{count}} items prepared',
  scanWork: '{{processed}} of {{total}} items',
  savingsEstimate: 'Up to {{size}} in extra copies',
  savingsHint:
    'Estimate from exact duplicates. Favorites and one copy are preserved. You review before removing.',
  savingsPending: 'Calculating cleanup opportunities',
  savingsNone: 'No extra copies with a known size found yet',
  largeReviewBytes: '{{size}} in large videos to review',
  partialSizes: 'Some file sizes are unavailable; this estimate is partial.',
  insightItems: '{{count}} items found',
  limitedLibrary: 'Showing only the photos you allowed.',
  libraryAccessTitle: 'Let’s open your library',
  libraryAccessHint:
    'Allow photo access to find photos and cleanup opportunities, privately on your phone.',
  preparationFailed: 'We could not finish preparing your library.',
  refreshIndex: 'Update library',
};
export const libraryPt: Record<keyof typeof libraryEn, string> = {
  viewProgress: 'Ver progresso do processamento',
  progressTitle: 'Progresso do processamento',
  progressStage: 'Etapa atual',
  progressReading: 'Encontrando fotos e vídeos',
  progressOpening: 'Preparando sua biblioteca para análise',
  progressHint:
    'O Seleva está organizando sua biblioteca para encontrar fotos parecidas, fotos borradas e textos que você pode buscar. Tudo acontece no seu celular.',
  progressStepHint:
    'O progresso é da etapa atual. A contagem recomeça quando a próxima etapa inicia.',
  progressWaiting: 'Preparando esta etapa…',
  progressComplete: 'Processamento concluído',
  progressPaused: 'Processamento pausado',
  progressSaved: 'Seu progresso está salvo. Você pode continuar explorando.',
  progressResume: 'Continuar processamento',
  progressRemaining: '{{count}} itens ainda precisam ser processados',
  progressPercent: '{{percent}}% desta etapa',
  progressDetails:
    'Você pode voltar e explorar enquanto o processamento continua.',
  limitedLibraryEmpty:
    'O Android não está disponibilizando fotos ao SelevaAI. Abra as configurações para selecionar fotos ou permitir acesso à biblioteca.',
  fastAnalysis: 'Encontrando fotos borradas e parecidas',
  deepAnalysis: 'Lendo textos e verificando cópias exatas',
  stagedAnalysisAvailable:
    '{{count}} resultados rápidos · {{pending}} aguardando análise completa',
  preanalysisSummary: 'Resumo da pré-análise',
  initialPreparationTitle: 'Preparando o resumo das suas fotos',
  initialPreparationHint: 'Só um instante. Estamos preparando tudo para você.',
  initialPreparationPending:
    'Alguns itens não puderam ser analisados. Seu progresso está salvo. Tente novamente para concluir a preparação.',
  initialCacheStep: 'Verificando análises salvas',
  initialMetadataStep: 'Etapa 1 de 2 · Lendo sua biblioteca',
  initialAnalysisStep: 'Etapa 2 de 2 · Analisando e categorizando',
  scanPartial:
    'Resultados salvos disponíveis; alguns itens ainda estão pendentes',
  metadataAvailable: '{{count}} itens no índice',
  analysisAvailable: '{{count}} analisados · {{pending}} pendentes',
  savedAnalysisHint:
    'Cada lote concluído fica salvo e disponível. Atualizações aproveitam as análises existentes. Use Atualizar biblioteca para buscar novas fotos.',
  preparingLibrary: 'Preparando sua biblioteca',
  analyzingLibrary: 'Encontrando oportunidades',
  preparationHint:
    'Você já pode explorar enquanto preparamos tudo no seu celular.',
  scanReady: 'Sua biblioteca está pronta',
  scanPaused: 'Continuaremos quando você voltar',
  scanCounts: '{{count}} itens preparados',
  scanWork: '{{processed}} de {{total}} itens',
  savingsEstimate: 'Até {{size}} em cópias extras',
  savingsHint:
    'Estimativa de duplicatas exatas. Favoritas e uma cópia são preservadas. Você revisa antes de remover.',
  savingsPending: 'Calculando oportunidades de limpeza',
  savingsNone: 'Ainda não encontramos cópias extras com tamanho conhecido',
  largeReviewBytes: '{{size}} em vídeos grandes para revisar',
  partialSizes:
    'Alguns tamanhos não estão disponíveis; esta estimativa é parcial.',
  insightItems: '{{count}} itens encontrados',
  limitedLibrary: 'Mostrando apenas as fotos que você autorizou.',
  libraryAccessTitle: 'Vamos abrir sua biblioteca',
  libraryAccessHint:
    'Permita o acesso para encontrar fotos e oportunidades de limpeza, com privacidade no seu celular.',
  preparationFailed: 'Não foi possível concluir a preparação da biblioteca.',
  refreshIndex: 'Atualizar biblioteca',
};
export const libraryEs: Record<keyof typeof libraryEn, string> = {
  viewProgress: 'Ver progreso del procesamiento',
  progressTitle: 'Progreso del procesamiento',
  progressStage: 'Paso actual',
  progressReading: 'Encontrando fotos y vídeos',
  progressOpening: 'Preparando tu biblioteca para analizarla',
  progressHint:
    'Seleva está organizando tu biblioteca para encontrar fotos parecidas, fotos borrosas y texto que puedes buscar. Todo ocurre en tu teléfono.',
  progressStepHint:
    'El progreso corresponde al paso actual. El contador vuelve a empezar al iniciar el siguiente paso.',
  progressWaiting: 'Preparando este paso…',
  progressComplete: 'Procesamiento completado',
  progressPaused: 'Procesamiento pausado',
  progressSaved: 'Tu progreso está guardado. Puedes seguir explorando.',
  progressResume: 'Continuar procesamiento',
  progressRemaining: '{{count}} elementos aún necesitan procesamiento',
  progressPercent: '{{percent}}% de este paso',
  progressDetails:
    'Puedes volver y explorar mientras continúa el procesamiento.',
  limitedLibraryEmpty:
    'Android no está dando acceso a fotos a SelevaAI. Abre Ajustes para seleccionar fotos o permitir acceso a tu biblioteca.',
  fastAnalysis: 'Buscando fotos borrosas y similares',
  deepAnalysis: 'Leyendo texto y verificando copias exactas',
  stagedAnalysisAvailable:
    '{{count}} resultados rápidos · {{pending}} esperando análisis completo',
  preanalysisSummary: 'Resumen del análisis previo',
  initialPreparationTitle: 'Preparando el resumen de tus fotos',
  initialPreparationHint: 'Solo un momento. Estamos preparando todo para ti.',
  initialPreparationPending:
    'No se pudieron analizar algunos elementos. Tu progreso está guardado. Inténtalo de nuevo para terminar la preparación.',
  initialCacheStep: 'Comprobando análisis guardados',
  initialMetadataStep: 'Paso 1 de 2 · Leyendo tu biblioteca',
  initialAnalysisStep: 'Paso 2 de 2 · Analizando y clasificando',
  scanPartial:
    'Resultados guardados disponibles; algunos elementos siguen pendientes',
  metadataAvailable: '{{count}} elementos en el índice',
  analysisAvailable: '{{count}} analizados · {{pending}} pendientes',
  savedAnalysisHint:
    'Cada lote terminado queda guardado y disponible. Las actualizaciones reutilizan el análisis existente. Usa Actualizar biblioteca para buscar fotos nuevas.',
  preparingLibrary: 'Preparando tu biblioteca',
  analyzingLibrary: 'Encontrando oportunidades',
  preparationHint:
    'Ya puedes explorar mientras preparamos todo en tu teléfono.',
  scanReady: 'Tu biblioteca está lista',
  scanPaused: 'Continuaremos cuando vuelvas',
  scanCounts: '{{count}} elementos preparados',
  scanWork: '{{processed}} de {{total}} elementos',
  savingsEstimate: 'Hasta {{size}} en copias extra',
  savingsHint:
    'Estimación de duplicados exactos. Se conservan los favoritos y una copia. Revisas antes de eliminar.',
  savingsPending: 'Calculando oportunidades de limpieza',
  savingsNone: 'Todavía no encontramos copias extra con tamaño conocido',
  largeReviewBytes: '{{size}} en vídeos grandes para revisar',
  partialSizes:
    'Algunos tamaños no están disponibles; esta estimación es parcial.',
  insightItems: '{{count}} elementos encontrados',
  limitedLibrary: 'Mostrando solo las fotos que autorizaste.',
  libraryAccessTitle: 'Vamos a abrir tu biblioteca',
  libraryAccessHint:
    'Permite el acceso para encontrar fotos y oportunidades de limpieza, con privacidad en tu teléfono.',
  preparationFailed: 'No se pudo terminar de preparar tu biblioteca.',
  refreshIndex: 'Actualizar biblioteca',
};
