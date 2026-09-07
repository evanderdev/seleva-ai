# ADR 004 — Processamento nativo

Aceito, implementação de scanner pendente. PhotoKit/MediaStore e análise pesada pertencem
a Swift/Kotlin. React solicita jobs, recebe páginas e progresso; não passa buffers ou itera
toda a biblioteca pela bridge. Exigir batches, checkpoints, cancelamento e memória limitada.
